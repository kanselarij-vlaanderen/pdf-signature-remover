import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import { LOG_INCOMING_DELTAS, PIECE_RESOURCE_BASE } from './cfg';
import DeltaCache from './lib/delta-cache';
import DeltaHandler from './lib/delta-handler';
import { stripSignaturesFromPiece } from './config/piece';

app.get('/', function(_req, res) {
  res.send('👋 pdf-signature-remover service here');
});

app.post('/pieces/:piece_id/strip', async function(req, res) {
  try {
    const pieceUri = PIECE_RESOURCE_BASE + req.params.piece_id;
    await stripSignaturesFromPiece(pieceUri);
    res.status(200).json({ message: 'Successfully stripped signatures from piece', pieceUri });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ 
      error: 'Failed to strip signatures from piece',
      message: error.message 
    });
  }
});

const cache = new DeltaCache();
const deltaHandler = new DeltaHandler();

app.post('/delta', bodyParser.json({ limit: '500mb' }), function(req, res) {
  const deltas = req.body;
  if (LOG_INCOMING_DELTAS)
    console.log(`Receiving deltas ${JSON.stringify(deltas)}`);

  cache.push(...deltas);
  deltaHandler.processDeltas(cache);

  res.status(202).end();
});

app.use(errorHandler);
