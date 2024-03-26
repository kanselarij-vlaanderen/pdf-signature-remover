# PDF Signature Remover

This service removes signatures from digitally signed PDFs and stores a copy of the stripped PDF.

This services builds upon the file-model as defined in the [file-service](https://github.com/mu-semtech/file-service). Any file metadata passed into or written by this service should conform to what the file-service expeccts.

## Tutorials

**Developing this service**

Add the following snippet to your `docker-compose.override.yml`:

``` yaml
  pdf-signature-remover:
    environment:
      NODE_ENV: "development"
      LOG_INCOMING_DELTAS: "true"
    volumes:
      - ../pdf-signature-remover-service:/app
      - ../pdf-signature-remover-service/config:/config
      - ./data/files:/share
```

## Reference

### Configuration

The following environment variables can be configured:

- `APPLICATION_GRAPH (string) ["http://mu.semte.ch/application"]`: The default graph where all operations will read from/write to
- `MU_APPLICATION_FILE_STORAGE_PATH (string) [""]`: The path, starting from `/share/`, where the service should write files to
- `LOG_INCOMING_DELTAS (boolean) [false]`: Whether to log the incoming deltas

This service provides scaffolding for handling mu-files and interacting with the `pdf-lib` library. To that end, a number of utility functions are provided to get and create mu-files in the triplestore (available in `lib/file.js`) and a function to remove the signatures from a digitally signed PDF (available in `lib/remove-signatures.js`). Further logic is implemented to process deltas in a FIFO way.

Users of this service should provide a JavaScript file mounted on `/config/delta-handling.js` that contains a default export function called `handle`, which takes in a list of deltas. The service provides a default implementation, which is tuned to the needs of the [Kaleidos](https://github.com/kanselarij-vlaanderen/app-kaleidos) project.



### API

Currently no user-facing endpoints are implemented.

### Deltas

The service expects deltas to arrive on the `/deltas` endpoint. Users of the service can decide by themselves which deltas they are interested in and how to handle them. An example, as used in the Kaleidos app, can be found in `config/delta-handling.js` and uses the following rules for the delta notifier:

```js
{
  match: {
    graph: {
      value: 'http://mu.semte.ch/graphs/organizations/kanselarij',
    },
    predicate: {
      type: 'uri',
      value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    },
    object: {
      type: 'uri',
      value: 'https://data.vlaanderen.be/ns/dossier#Stuk',
    }
  },
  callback: {
    url: 'http://pdf-signature-remover/delta',
    method: 'POST'
  },
  options: {
    resourceFormat: 'v0.0.1',
    gracePeriod: 1000,
    ignoreFromSelf: true
  }
}
```
