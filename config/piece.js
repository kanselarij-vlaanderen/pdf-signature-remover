import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
  query,
  update,
} from 'mu';
import { APPLICATION_GRAPH } from '../cfg';

const PIECE_RESOURCE_BASE = process.env.PIECE_RESOURCE_BASE || 'http://themis.vlaanderen.be/id/stuk/';
const ACCESS_LEVEL_PUBLIC = 'http://themis.vlaanderen.be/id/concept/toegangsniveau/c3de9c70-391e-4031-a85e-4b03433d6266';
const ACCESS_LEVEL_GOVERNMENT = 'http://themis.vlaanderen.be/id/concept/toegangsniveau/634f438e-0d62-4ae4-923a-b63460f6bc46';

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
  }
  FILTER EXISTS { ?documentContainer a dossier:Serie ; dossier:Collectie.bestaatUit ?piece }
  FILTER NOT EXISTS { ?unsignedPiece sign:getekendStukKopie ?piece }
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

SELECT DISTINCT
  (?file AS ?uri) ?id ?name ?format ?size ?extension ?created ?physicalUri ?pieceName
WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    VALUES ?piece { ${sparqlEscapeUri(uri)} }
    ?piece a dossier:Stuk ;
      dct:title ?pieceName ;
      prov:value ?file .

    ?file a nfo:FileDataObject ;
      mu:uuid ?id ;
      nfo:fileName ?name ;
      dct:format ?format ;
      nfo:fileSize ?size ;
      dbpedia:fileExtension ?extension ;
      dct:created ?created .
    ?physicalUri nie:dataSource ?file .
  }
  FILTER NOT EXISTS { ?piece sign:getekendStukKopie ?signedPieceCopy }
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
    };
  }
  return null;
}

async function linkSignatureStrippedPDFToPiece(pieceUri, unsignedFileUri, graph=APPLICATION_GRAPH, updateFunction=update) {
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
    ${sparqlEscapeUri(pieceUri)} prov:value ?signedFile .
  }
}
INSERT {
  GRAPH ${sparqlEscapeUri(graph)} {
    ${sparqlEscapeUri(pieceUri)} prov:value ${sparqlEscapeUri(unsignedFileUri)} .

    ${sparqlEscapeUri(newPieceUri)} a dossier:Stuk ;
      mu:uuid ${sparqlEscapeString(id)} ;
      dct:title ?copyName ;
      dct:created ${sparqlEscapeDateTime(now)} ;
      dct:modified ${sparqlEscapeDateTime(now)} ;
      prov:value ?signedFile ;
      besluitvorming:vertrouwelijkheidsniveau ?accessLevel ;
      sign:ongetekendStuk ${sparqlEscapeUri(pieceUri)} .
  }
}
WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    ${sparqlEscapeUri(pieceUri)} dct:title ?name ;
      prov:value ?signedFile ;
      besluitvorming:vertrouwelijkheidsniveau ?prevAccessLevel .
  }
  BIND(
    IF(?prevAccessLevel IN (${sparqlEscapeUri(ACCESS_LEVEL_PUBLIC)}),
    ${sparqlEscapeUri(ACCESS_LEVEL_GOVERNMENT)},
    ?prevAccessLevel)
  AS ?accessLevel)
  BIND(CONCAT(?name, " (met certificaat)") AS ?copyName)
}`;
  await updateFunction(queryString);
}

export {
  isMainPiece,
  getFileFromPiece,
  linkSignatureStrippedPDFToPiece,
}
