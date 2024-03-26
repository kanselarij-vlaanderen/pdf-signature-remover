import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  sparqlEscapeInt,
  query,
  update,
  uuid,
} from 'mu';
import fs from 'fs';
import path from 'path';
import { APPLICATION_GRAPH, FILE_STORAGE_PATH } from '../cfg';

/**
 * Fetches the virtual file by its UUID if it exists
 * @param {string} id
 * @param {string} [graph=APPLICATION_GRAPH] The graph to read from
 * @param {Function} [queryFunction=query] The function to use to query, most
 *   likely value will be querySudo
 * @returns {Promise<VirtualFile | null>} The virtual file, or null if it couldn't be found
 */
async function getMuFile(id, graph=APPLICATION_GRAPH, queryFunction=query) {
  const queryString = `
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX dbpedia: <http://dbpedia.org/ontology/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

SELECT DISTINCT
  (?file AS ?uri) ?name ?format ?size ?extension ?created ?physicalUri
WHERE {
  GRAPH ${sparqlEscapeUri(graph)} {
    ?file mu:uuid ${sparqlEscapeString(id)} ;
      a nfo:FileDataObject ;
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
      id,
      uri: binding.uri.value,
      name: binding.name.value,
      format: binding.format.value,
      size: binding.size.value,
      extension: binding.extension.value,
      created: binding.created.value,
      physicalUri: binding.physicalUri.value,
    };
  }
  return null;
}

/**
 * Stores a virtual and physical file in the triplestore
 * @param {VirtualFile} virtualFile 
 * @param {PhysicalFile} physicalFile 
 * @param {string} [graph=APPLICATION_GRAPH] The graph to write to
 * @param {Function} [updateFunction=update] The function to use to send the
 *   update query, most likelky value will be updateSudo
 */
async function createMuFile(virtualFile, physicalFile, graph=APPLICATION_GRAPH, updateFunction=update) {
  const queryString = `
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX dbpedia: <http://dbpedia.org/ontology/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

INSERT DATA {
  GRAPH ${sparqlEscapeUri(graph)} {
    ${sparqlEscapeUri(virtualFile.uri)} a nfo:FileDataObject ;
      nfo:fileName ${sparqlEscapeString(virtualFile.name)} ;
      mu:uuid ${sparqlEscapeString(virtualFile.id)} ;
      dct:format ${sparqlEscapeString(virtualFile.format)} ;
      nfo:fileSize ${sparqlEscapeInt(virtualFile.size)} ;
      dbpedia:fileExtension ${sparqlEscapeString(virtualFile.extension)} ;
      dct:created ${sparqlEscapeDateTime(virtualFile.created)} ;
      dct:modified ${sparqlEscapeDateTime(virtualFile.created)} .
    ${sparqlEscapeUri(physicalFile.uri)} a nfo:FileDataObject ;
      nie:dataSource ${sparqlEscapeUri(virtualFile.uri)} ;
      nfo:fileName ${sparqlEscapeString(physicalFile.name)} ;
      mu:uuid ${sparqlEscapeString(physicalFile.id)} ;
      dct:format ${sparqlEscapeString(physicalFile.format)} ;
      nfo:fileSize ${sparqlEscapeInt(physicalFile.size)} ;
      dbpedia:fileExtension ${sparqlEscapeString(physicalFile.extension)} ;
      dct:created ${sparqlEscapeDateTime(physicalFile.created)} ;
      dct:modified ${sparqlEscapeDateTime(physicalFile.created)} .
  }
}`;
  await updateFunction(queryString);
};

/**
 * Reads the contents of the on-disk file represented by the virtual file
 * @param {VirtualFile} virtualFile 
 * @returns {Uint8Array} The 
 */
function readMuFile(virtualFile) {
  const filePath = shareUriToPath(virtualFile.physicalUri);
  const pdfBytes = fs.readFileSync(filePath);
  return pdfBytes
}

/**
 * Writes the passed in data to disk, respecting the configured
 * MU_APPLICATION_FILE_STORAGE_PATH.
 * @param {Uint8Array} data 
 * @returns {FileIdAndPath}
 */
function writeMuFile(data) {
    const physicalFileUuid = uuid();
    const filePath = path.join(FILE_STORAGE_PATH, `${physicalFileUuid}.pdf`);
    fs.writeFileSync(filePath, data);
    return { id: physicalFileUuid, path: filePath };
}

/**
 * @param {string} path 
 * @returns {string} The uri
 */
function pathToShareUri(path) {
  return path.replace('/share/', 'share://');
}

/**
 * @param {string} uri 
 * @returns {string} The path
 */
function shareUriToPath(uri) {
  return uri.replace('share://', '/share/');
}

export {
  getMuFile,
  createMuFile,
  readMuFile,
  writeMuFile,
  pathToShareUri,
  shareUriToPath,
}
