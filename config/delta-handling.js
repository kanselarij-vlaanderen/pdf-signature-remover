import { uuid } from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';

import { FILE_RESOURCE_BASE } from '../cfg';
import removeSignatures from '../lib/remove-signatures';
import { createMuFile, pathToShareUri, readMuFile, writeMuFile } from '../lib/file';
import { getFileFromPiece, isMainPiece, linkSignatureStrippedPDFToPiece } from "./piece";

const KANSELARIJ_GRAPH = 'http://mu.semte.ch/graphs/organizations/kanselarij';

function getInterestedQuads(deltas) {
  const inserts = deltas
        .map((delta) => delta.inserts)
        .reduce((allInserts, inserts) => allInserts.concat(inserts));

  const filteredOnPredicate = inserts
        .filter(({ predicate }) => predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type');

  const filteredOnObject = filteredOnPredicate
        .filter(({ object }) => object.value === 'https://data.vlaanderen.be/ns/dossier#Stuk');

  const interestedQuads = filteredOnObject
        .filter((quad, index) =>
          // Array#findIndex returns the first element that matches
          // So we're iterating over the array and getting the quad and its
          // index, and every time we look for the index of the first occurrence
          // of that quad. The outer filter then checks if the iteration's index
          // matches the index returned by findIndex, in which case it's the
          // first occurence and we store it. Any latter occurrences of the quad
          // get discarded
          filteredOnObject.findIndex(
            (_quad) => quad.subject.value === _quad.subject.value
          ) === index)

  return interestedQuads;
}

export default async function handle(deltas) {
  const interestedQuads = getInterestedQuads(deltas);
  if (interestedQuads.length === 0) {
    return;
  }

  for (const quad of interestedQuads) {
    const pieceUri = quad.subject.value;
    if (!await isMainPiece(pieceUri, KANSELARIJ_GRAPH, querySudo)) {
      console.log(`Quad with subject <${pieceUri}> is not a "main" piece and we will not treat it further`);
      continue;
    }

    const file = await getFileFromPiece(pieceUri, KANSELARIJ_GRAPH, querySudo);
    if (file === null || (file?.format.indexOf('application/pdf') === -1 && file?.extension?.toLowerCase() !== 'pdf')) {
      console.log(`Quad with subject <${pieceUri}> does not have a file or the file isn't a PDF, not processing further`);
      continue;
    }


    const pdfBytes = readMuFile(file);
    const pdfBytesWithoutSignatures = await removeSignatures(pdfBytes);

    if (pdfBytesWithoutSignatures === null) {
      console.log(`Quad with subject <${pieceUri}> did not have signatures in its file, not processing further`)
      continue;
    }

    console.log(`Generated PDF without signatures for signed file ${file.uri}`);

    const { id: physicalFileUuid, path: pdfWithoutSignaturesPath} = writeMuFile(pdfBytesWithoutSignatures);
    console.log(`Wrote PDF without signatures to ${pdfWithoutSignaturesPath}`);


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
    await createMuFile(virtualFile, physicalFile, KANSELARIJ_GRAPH, updateSudo);

    console.log(`Linking virtual mu-file ${virtualFile.uri} to piece ${pieceUri}`);
    await linkSignatureStrippedPDFToPiece(
      pieceUri,
      file.uri,
      virtualFile.uri,
      !!file.derivedFile,
      KANSELARIJ_GRAPH,
      updateSudo
    );
  }
}
