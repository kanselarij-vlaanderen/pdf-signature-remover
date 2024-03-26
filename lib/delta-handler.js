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
          await handle(deltas);
        } catch(e) {
          console.log("Someting went wrong while processing delta's");
          console.error(e);
        } finally {
          this.isProcessing = false;
        }
      }
    }
  }
}
