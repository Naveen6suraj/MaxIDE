/**
 * Script to upgrade Cafe Menu application in C:\Users\navee\AppData\Roaming\MaxIDE\workspace
 * with genuine food and beverage photography, responsive media markup, and offline vector fallbacks.
 */

import fs from 'fs';
import path from 'path';
import { AssetSelectionEngine } from '../intelligence/AssetSelectionEngine.js';

const workspaceDir = 'C:\\Users\\navee\\AppData\\Roaming\\MaxIDE\\workspace';
const appJsPath = path.join(workspaceDir, 'app.js');
const stylesCssPath = path.join(workspaceDir, 'styles.css');

if (!fs.existsSync(appJsPath)) {
  console.error('Workspace app.js not found at:', appJsPath);
  process.exit(1);
}

// Photographic assets mapping for all 16 items
const photoMap: Record<string, { url: string; alt: string; category: string }> = {
  'c1': {
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80',
    alt: 'Smoked Vanilla Flat White with silky microfoam',
    category: 'FOOD_BEVERAGE',
  },
  'c2': {
    url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?auto=format&fit=crop&w=600&q=80',
    alt: 'Nitro Cold Brew with cascading salted cream foam',
    category: 'FOOD_BEVERAGE',
  },
  'c3': {
    url: 'https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=600&q=80',
    alt: 'Spanish Cortado espresso with cinnamon dusting',
    category: 'FOOD_BEVERAGE',
  },
  'c4': {
    url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?auto=format&fit=crop&w=600&q=80',
    alt: 'Hazelnut Espresso Tonic garnished with orange peel',
    category: 'FOOD_BEVERAGE',
  },
  't1': {
    url: 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?auto=format&fit=crop&w=600&q=80',
    alt: 'Ceremonial Iced Matcha Latte whisked with almond milk',
    category: 'FOOD_BEVERAGE',
  },
  't2': {
    url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=600&q=80',
    alt: 'Blood Orange Hibiscus Cooler with fresh mint sprigs',
    category: 'FOOD_BEVERAGE',
  },
  't3': {
    url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80',
    alt: 'Spiced London Fog with cardamom pods and vanilla bean',
    category: 'FOOD_BEVERAGE',
  },
  'b1': {
    url: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80',
    alt: 'Pistachio Cream Brioche Croissant with toasted slivers',
    category: 'FOOD_BEVERAGE',
  },
  'b2': {
    url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80',
    alt: 'Spiced Apple Cardamom Cruffin dusted with ginger sugar',
    category: 'FOOD_BEVERAGE',
  },
  'b3': {
    url: 'https://images.unsplash.com/photo-1589367920969-ab8e050bbb04?auto=format&fit=crop&w=600&q=80',
    alt: 'Artisan Sourdough Loaf Slice with Normandy butter',
    category: 'FOOD_BEVERAGE',
  },
  'br1': {
    url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=600&q=80',
    alt: 'Avocado & Heirloom Tartine with Persian feta and soft egg',
    category: 'FOOD_BEVERAGE',
  },
  'br2': {
    url: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&w=600&q=80',
    alt: 'Wild Acai & Dragonfruit Bowl with berries and chia seeds',
    category: 'FOOD_BEVERAGE',
  },
  'br3': {
    url: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?auto=format&fit=crop&w=600&q=80',
    alt: 'Brioche French Toast with bruleed black mission figs',
    category: 'FOOD_BEVERAGE',
  },
  'g1': {
    url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=600&q=80',
    alt: 'Truffled Wild Mushroom Melt with aged Gruyere on sourdough',
    category: 'FOOD_BEVERAGE',
  },
  'g2': {
    url: 'https://images.unsplash.com/photo-1588137378633-dea1336ce1e2?auto=format&fit=crop&w=600&q=80',
    alt: 'Smoked Salmon Bagel with scallion cream cheese and capers',
    category: 'FOOD_BEVERAGE',
  },
  'g3': {
    url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=600&q=80',
    alt: 'Mediterranean Grain & Grilled Halloumi Bowl with mint tahini',
    category: 'FOOD_BEVERAGE',
  },
};

let appJs = fs.readFileSync(appJsPath, 'utf8');

// Strip any previously added imageUrl, fallbackUri, imageAlt lines to avoid duplication/syntax errors
appJs = appJs.replace(/\s+imageUrl:\s*'.*?',/g, '');
appJs = appJs.replace(/\s+fallbackUri:\s*'.*?',/g, '');
appJs = appJs.replace(/\s+imageAlt:\s*'.*?',/g, '');

// Cleanly inject photo properties into MENU_DATA
for (const [id, photo] of Object.entries(photoMap)) {
  const asset = AssetSelectionEngine.resolveAsset(id, photo.category);
  const fallback = asset.fallbackDataUri; // now guaranteed base64
  
  const targetRegex = new RegExp(`(id:\\s*'${id}'[\\s\\S]*?icon:\\s*['"][^'"]+['"],)`, 'm');
  appJs = appJs.replace(targetRegex, `$1\n    imageUrl: '${photo.url}',\n    fallbackUri: '${fallback}',\n    imageAlt: '${photo.alt.replace(/'/g, "\\'")}',`);
}

// Update renderMenu card template to render actual <img> tags
const newRenderCard = `      <article class="menu-card" data-id="\${item.id}">
        <div class="card-media-wrapper">
          <img src="\${item.imageUrl}" onerror="this.onerror=null;this.src='\${item.fallbackUri}';" alt="\${item.imageAlt}" class="item-photo" loading="lazy" />
          <span class="item-tag">\${item.tag}</span>
        </div>
        <div class="card-content-wrap">
          <h3 class="item-name">\${item.name}</h3>
          <p class="item-desc">\${item.desc}</p>
          <div class="card-bottom">
            <div>
              <div class="item-price">\$\${item.price.toFixed(2)}</div>
              <span class="item-calories">\${item.calories}</span>
            </div>
            <button class="add-btn" onclick="addToOrder('\${item.id}')">
              <span>+ Add</span>
            </button>
          </div>
        </div>
      </article>`;

// Find and replace the return block inside renderMenu
appJs = appJs.replace(/<article class="menu-card"[\s\S]*?<\/article>/m, newRenderCard.trim());

fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log('Cleaned and updated app.js with valid Base64 photography assets.');
