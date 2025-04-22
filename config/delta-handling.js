import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import { stripSignaturesFromPiece } from "./piece";
import { KANSELARIJ_GRAPH } from '../cfg';

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
    console.log('Deltas contained no interesting quads, not doing anything');
    return;
  }

  console.log(`Found ${interestedQuads.length} quads in deltas that we will handle`);

  for (const quad of interestedQuads) {
    const pieceUri = quad.subject.value;
    try {
      await stripSignaturesFromPiece(pieceUri, KANSELARIJ_GRAPH, querySudo, updateSudo);
    } catch (error) {
      console.log(error.message);
    }
  }
  console.log('Finished handling incoming deltas');
}
