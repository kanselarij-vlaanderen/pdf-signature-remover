import path from 'path';
import fs from 'fs';

const APPLICATION_GRAPH = process.env.MU_APPLICATION_GRAPH || 'http://mu.semte.ch/application';
const MU_APPLICATION_FILE_STORAGE_PATH = process.env.MU_APPLICATION_FILE_STORAGE_PATH || '';
const FILE_RESOURCE_BASE = process.env.FILE_RESOURCE_BASE || 'http://themis.vlaanderen.be/id/bestand/';

const LOG_INCOMING_DELTAS = isTruthy(process.env.LOG_INCOMING_DELTAS);

const FILE_STORAGE_PATH = path.join('/share/', `${MU_APPLICATION_FILE_STORAGE_PATH}/`);
if (!fs.existsSync(FILE_STORAGE_PATH)) {
  fs.mkdirSync(FILE_STORAGE_PATH);
}

function isTruthy(value) {
  return [true, 'true', 1, '1', 'yes', 'Y', 'on'].includes(value);
}

export {
  APPLICATION_GRAPH,
  FILE_STORAGE_PATH,
  FILE_RESOURCE_BASE,
  LOG_INCOMING_DELTAS,
}
