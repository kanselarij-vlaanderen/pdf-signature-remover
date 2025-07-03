import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
  query,
  update,
} from 'mu';
import { APPLICATION_GRAPH, KANSELARIJ_GRAPH, FILE_RESOURCE_BASE, RETRY_TIMEOUT_MS } from '../cfg';
import removeSignatures from '../lib/remove-signatures';
import { createMuFile, pathToShareUri, readMuFile, deleteMuFile, writeMuFile } from '../lib/file';

const PIECE_RESOURCE_BASE = process.env.PIECE_RESOURCE_BASE || 'http://themis.vlaanderen.be/id/stuk/';
const ACCESS_LEVEL_PUBLIC = 'http://themis.vlaanderen.be/id/concept/toegangsniveau/c3de9c70-391e-4031-a85e-4b03433d6266';
const ACCESS_LEVEL_GOVERNMENT = 'http://themis.vlaanderen.be/id/concept/toegangsniveau/634f438e-0d62-4ae4-923a-b63460f6bc46';
const ACCESS_LEVEL_CABINET = 'http://themis.vlaanderen.be/id/concept/toegangsniveau/13ae94b0-6188-49df-8ecd-4c4a17511d6d';

async function isMainPiece(uri, graph=APPLICATION_GRAPH, queryFunction=query) {
  const queryString = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

ASK
WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    VALUES ?piece { ${sparqlEscapeUri(uri)} }
    ?piece a dossier:Stuk ;
      prov:value ?file .
    ?documentContainer a dossier:Serie ;
      dossier:Collectie.bestaatUit ?piece .
    FILTER NOT EXISTS { ?piece sign:ongetekendStuk ?unsignedPiece }
  }
}`;

  const response = await queryFunction(queryString);
  return response?.boolean ?? false;
}

async function getFileFromPiece(uri, graph=APPLICATION_GRAPH, queryFunction=query) {
  const queryString = `
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX dbpedia: <http://dbpedia.org/ontology/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>

SELECT DISTINCT
  (?file AS ?uri) ?id ?name ?format ?size ?extension ?created ?physicalUri ?pieceName ?derivedFile ?accessLevel
WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    VALUES ?piece { ${sparqlEscapeUri(uri)} }
    ?piece a dossier:Stuk ;
      dct:title ?pieceName ;
      prov:value ?sourceFile .

    OPTIONAL { ?piece besluitvorming:vertrouwelijkheidsniveau ?accessLevel }
    OPTIONAL { ?derivedFile prov:hadPrimarySource ?sourceFile }

    BIND(COALESCE(?derivedFile, ?sourceFile) AS ?file)

    ?file a nfo:FileDataObject ;
      mu:uuid ?id ;
      nfo:fileName ?name ;
      dct:format ?format ;
      nfo:fileSize ?size ;
      dbpedia:fileExtension ?extension ;
      dct:created ?created .
    ?physicalUri nie:dataSource ?file .
  }
} LIMIT 1`;

  const response = await queryFunction(queryString);

  if (response?.results?.bindings?.length) {
    const binding = response.results.bindings[0];
    return {
      id: binding.id.value,
      uri: binding.uri.value,
      name: binding.name.value,
      format: binding.format.value,
      size: binding.size.value,
      extension: binding.extension.value,
      created: binding.created.value,
      physicalUri: binding.physicalUri.value,
      pieceName: binding.pieceName.value,
      derivedFile: binding.derivedFile?.value,
      accessLevel: binding.accessLevel?.value,
    };
  }
  return null;
}

async function linkSignatureStrippedPDFToPiece(pieceUri, signedFileUri, unsignedFileUri, replaceDerivedFile=false, graph=APPLICATION_GRAPH, updateFunction=update) {
  const id = uuid();
  const newPieceUri = `${PIECE_RESOURCE_BASE}${id}`;
  const now = new Date();

  const queryString = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>
PREFIX besluitvorming: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX prov: <http://www.w3.org/ns/prov#>

DELETE {
  GRAPH ${sparqlEscapeUri(graph)} {
    ${
      replaceDerivedFile ? `${sparqlEscapeUri(signedFileUri)} prov:hadPrimarySource ?sourceFile .` :
      `${sparqlEscapeUri(pieceUri)} prov:value ${sparqlEscapeUri(signedFileUri)} .`
    }
  }
}
INSERT {
  GRAPH ${sparqlEscapeUri(graph)} {
    ${
      replaceDerivedFile ? `${sparqlEscapeUri(unsignedFileUri)} prov:hadPrimarySource ?sourceFile .` :
      `${sparqlEscapeUri(pieceUri)} prov:value ${sparqlEscapeUri(unsignedFileUri)} .`
    }

    ${sparqlEscapeUri(newPieceUri)} a dossier:Stuk ;
      mu:uuid ${sparqlEscapeString(id)} ;
      dct:title ?copyName ;
      dct:created ${sparqlEscapeDateTime(now)} ;
      dct:modified ${sparqlEscapeDateTime(now)} ;
      prov:value ${sparqlEscapeUri(signedFileUri)} ;
      besluitvorming:vertrouwelijkheidsniveau ?accessLevel ;
      sign:ongetekendStuk ${sparqlEscapeUri(pieceUri)} .
  }
}
WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    ${sparqlEscapeUri(pieceUri)} dct:title ?name ;
      ${replaceDerivedFile ? 'prov:value ?sourceFile ;' : ''}
      besluitvorming:vertrouwelijkheidsniveau ?prevAccessLevel .
  }
  BIND(
    IF(?prevAccessLevel IN (${sparqlEscapeUri(ACCESS_LEVEL_PUBLIC)}, ${sparqlEscapeUri(ACCESS_LEVEL_GOVERNMENT)}),
    ${sparqlEscapeUri(ACCESS_LEVEL_CABINET)},
    ?prevAccessLevel)
  AS ?accessLevel)
  BIND(CONCAT(?name, " (met certificaat)") AS ?copyName)
}`;
  await updateFunction(queryString);
}

async function getExistingSignedPieces(pieceUri, graph=APPLICATION_GRAPH, queryFunction=query) {
  const queryString = `
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>

SELECT ?signedPiece ?signedPieceCopy
WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    VALUES ?piece { ${sparqlEscapeUri(pieceUri)} }
    ?signedPiece sign:ongetekendStuk ?piece .
    OPTIONAL { ?piece sign:getekendStukKopie ?signedPieceCopy . }
  }
} LIMIT 1`;

  const response = await queryFunction(queryString);

  if (response?.results?.bindings?.length) {
    const binding = response.results.bindings[0];
    return {
      signedPiece: binding.signedPiece.value,
      signedPieceCopy: binding.signedPieceCopy.value
    };
  }
  return {
    signedPiece: null,
    signedPieceCopy: null
  };
}

async function deleteExistingSignedPiece(pieceUri, graph=APPLICATION_GRAPH, updateFunction=update) {
  const updateString = `
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
DELETE {
  GRAPH ${sparqlEscapeUri(graph)} {
    ?signedPiece sign:ongetekendStuk ?piece ;
                 ?p ?o .
  }
} WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    VALUES ?piece { ${sparqlEscapeUri(pieceUri)} }
    ?signedPiece sign:ongetekendStuk ?piece ;
                ?p ?o .
  }
}`;
  await updateFunction(updateString);
}

async function deleteExistingSignedPieceCopy(pieceUri, graph=APPLICATION_GRAPH, updateFunction=update) {
  const updateString = `
PREFIX sign: <http://mu.semte.ch/vocabularies/ext/handtekenen/>
DELETE {
  GRAPH ${sparqlEscapeUri(graph)} {
    ?piece sign:getekendStukKopie ?signedPieceCopy .
    ?signedPieceCopy ?p ?o .
  }
} WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    VALUES ?piece { ${sparqlEscapeUri(pieceUri)} }
    ?piece sign:getekendStukKopie ?signedPieceCopy .
    ?signedPieceCopy ?p ?o .
  }
}`;
  await updateFunction(updateString);
}

async function stripSignaturesFromPiece(pieceUri, graph=KANSELARIJ_GRAPH, queryFunction=query, updateFunction=update, retryCount=0) {
  try {
    // TODO do we want to query if this is actually a main piece by relation to agendaitem/subcase/submission/meeting?
    // checking if the piece is connected to a documentContainer has no further benefit, it is not required anywhere else in this process
    const mainPiece = await isMainPiece(pieceUri, graph, queryFunction);
    if (!mainPiece) {
      if (retryCount < 1) {
        console.log(`Quad with subject <${pieceUri}> is not a "main" piece, retrying once after waiting ${RETRY_TIMEOUT_MS} ms`);
        await new Promise((r) => setTimeout(r, RETRY_TIMEOUT_MS));
        return stripSignaturesFromPiece(pieceUri, graph, queryFunction, updateFunction, retryCount + 1);
      } else {
        throw new Error('piece was not connected to documentContainer or already had a signedPiece');
      }
    }
  } catch (error) {
    console.log(error.message);
    throw new Error(`Quad with subject <${pieceUri}> is not a "main" piece and we will not treat it further`);
  }

  const file = await getFileFromPiece(pieceUri, graph, queryFunction);
  if (file === null || (file?.format.indexOf('application/pdf') === -1 && file?.extension?.toLowerCase() !== 'pdf')) {
    throw new Error(`Quad with subject <${pieceUri}> does not have a file or the file isn't a PDF, not processing further`);
  }

  if (!file?.accessLevel) {
    // probably publication piece, insert data will fail without accessLevel
    throw new Error(`Quad with subject <${pieceUri}> does not have an accessLevel, not processing further`);
  }

  const pdfBytes = readMuFile(file);
  const pdfBytesWithoutSignatures = await removeSignatures(pdfBytes);

  if (pdfBytesWithoutSignatures === null) {
    throw new Error(`Quad with subject <${pieceUri}> did not have signatures in its file, not processing further`);
  }

  console.log(`Generated PDF without signatures for signed file ${file.uri}`);

  const { id: physicalFileUuid, path: pdfWithoutSignaturesPath} = writeMuFile(pdfBytesWithoutSignatures);
  console.log(`Wrote PDF without signatures to ${pdfWithoutSignaturesPath}`);

  const { signedPiece, signedPieceCopy } = await getExistingSignedPieces(pieceUri, graph, queryFunction);
  if (signedPiece) {
    console.log(`Piece with URI <${pieceUri}> already had a signed piece with URI <${signedPiece}>. Deleting it first`);
    const signedPieceFile = await getFileFromPiece(signedPiece, graph, queryFunction);
    if (signedPieceFile) {
      await deleteMuFile(signedPieceFile.uri, signedPieceFile.physicalUri, graph, updateFunction);
    }
    await deleteExistingSignedPiece(pieceUri, graph, updateFunction);
  }
  if (signedPieceCopy) {
    console.log(`Piece with URI <${pieceUri}> already had a flattened signed piece copy with URI <${signedPieceCopy}>. Deleting it first`);
    const signedPieceCopyFile = await getFileFromPiece(signedPieceCopy, graph, queryFunction);
    if (signedPieceCopyFile) {
      await deleteMuFile(signedPieceCopyFile.uri, signedPieceCopyFile.physicalUri, graph, updateFunction);
    }
    await deleteExistingSignedPieceCopy(pieceUri, graph, updateFunction);
  }

  const now = new Date();
  const virtualFileUuid = uuid();
  const virtualFile = {
    id: virtualFileUuid,
    uri: FILE_RESOURCE_BASE + virtualFileUuid,
    name: `${file.pieceName}.pdf`,
    extension: 'pdf',
    size: pdfBytesWithoutSignatures.byteLength,
    created: now,
    format: 'application/pdf',
  };

  const physicalFile = {
    id: physicalFileUuid,
    uri: pathToShareUri(pdfWithoutSignaturesPath),
    name: `${physicalFileUuid}.pdf`,
    extension: 'pdf',
    size: pdfBytesWithoutSignatures.byteLength,
    created: now,
    format: 'application/pdf',
  };

  console.log(`Creating virtual mu-file ${virtualFile.uri}`);
  await createMuFile(virtualFile, physicalFile, graph, updateFunction);

  console.log(`Linking virtual mu-file ${virtualFile.uri} to piece ${pieceUri}`);
  await linkSignatureStrippedPDFToPiece(
    pieceUri,
    file.uri,
    virtualFile.uri,
    !!file.derivedFile,
    graph,
    updateFunction
  );
}

export {
  isMainPiece,
  getFileFromPiece,
  linkSignatureStrippedPDFToPiece,
  stripSignaturesFromPiece,
}
