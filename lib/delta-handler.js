import handle from "../config/delta-handling";

export default class DeltaHandler {
  constructor() {
    this.isProcessing = false;
    this.hasTimeout = false;
  }

  /**
   * @param {DeltaCache} cache
   */
  async processDeltas(cache) {
    if (!cache.isEmpty) {
      if (this.isProcessing) {
        console.log("The PDF form remover service is already running. Not triggering new delta handling now. Received delta's will be put in the waiting queue.");
        if (!this.hasTimeout) {
          this.hasTimeout = true;
          setTimeout(() => {
            this.hasTimeout = false;
            this.processDeltas(cache);
          }, 1000);
        }
      } else {
        try {
          this.isProcessing = true;
          const deltas = cache.clear();
          console.log(`Started processing batch of ${deltas.length} deltas.`);
          for (const delta of deltas) {
            try {
              await handle([delta]);
            } catch(e) {
              console.error(`Something went wrong while processing delta "${JSON.stringify(delta)}", continuing with further deltas in current batch.`);
              console.error(e);
            }
          }
          console.log("Finished handling batch of deltas.");
        } catch(e) {
          console.warning("Something went wrong while processing a batch of deltas, the whole batch will be lost but any progress up until the error will persist.");
          console.error(e);
        } finally {
          this.isProcessing = false;
        }
      }
    }
  }
}
