const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

let predictions = [];
let lastUpdate = '';

async function scrapeStake() {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    await page.goto('https://stake.com/es/casino/games/baccarat', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Esperar tabla de historia
    await page.waitForSelector('[class*="history"], .history, [class*="resultados"], .resultados', { timeout: 10000 });
    
    const history = await page.evaluate(() => {
      const selectors = ['[class*="history"]', '.history', '[class*="resultados"]', '.resultados', '[class*="last"]'];
      for (let sel of selectors) {
        const elements = document.querySelectorAll(sel);
        if (elements.length > 0) {
          return Array.from(elements[0].children || elements[0].rows || elements)
            .slice(-20)
            .map(row => row.textContent?.trim() || row.innerText?.trim() || '')
            .filter(text => text && (text.includes('B') || text.includes('P') || text.includes('E')))
            .reverse();
        }
      }
      return [];
    });

    await browser.close();

    if (history.length >= 10) {
      const last10 = history.slice(-10);
      const bankerCount = last10.filter(r => r.includes('B') || r.includes('Banker') || r.includes('Banquero')).length;
      const playerCount = last10.filter(r => r.includes('P') || r.includes('Player') || r.includes('Jugador')).length;
      
      const prediction = bankerCount > playerCount ? '🟢 BANQUERO' : '🔵 JUGADOR';
      const confidence = Math.max(bankerCount, playerCount) / 10 * 100;
      
      predictions = [{
        prediction,
        confidence: confidence.toFixed(0) + '%',
        history: last10.slice(-10),
        timestamp: new Date().toLocaleString('es-AR')
      }];
      
      lastUpdate = `✅ ¡ÉXITO! ${history.length} resultados procesados`;
    } else {
      lastUpdate = `⚠️ Solo ${history.length} resultados encontrados`;
      predictions = [{ prediction: 'Esperando más datos...', confidence: '0%', history: [], timestamp: '' }];
    }
  } catch (error) {
    console.error('Error scraping:', error.message);
    lastUpdate = `❌ Error: ${error.message.slice(0, 50)}...`;
    predictions = [{ prediction: 'Error de conexión', confidence: '0%', history: [], timestamp: '' }];
  }
}

// API endpoints
app.get('/api/predictions', (req, res) => {
  res.json({ predictions, lastUpdate });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Auto-refresh cada 30s
setInterval(scrapeStake, 30000);
scrapeStake(); // Primera ejecución

app.listen(port, () => {
  console.log(`🚀 Servidor en puerto ${port}`);
});