/**
 * Aroma & Oak — Artisanal Cafe & Kitchen
 * Interactive Order & Menu Management Engine
 */

// 1. Menu Database
const MENU_DATA = [
  // Specialty Coffee
  {
    id: 'c1',
    category: 'coffee',
    name: 'Smoked Vanilla Flat White',
    desc: 'Double shot of single-origin Ethiopian beans with velvety steamed oat milk and Madagascar smoked vanilla syrup.',
    price: 5.75,
    calories: '160 kcal',
    tag: 'Bestseller',
    icon: '☕',
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    id: 'c2',
    category: 'coffee',
    name: 'Nitro Cold Brew & Salted Foam',
    desc: 'Cold steeped for 20 hours, infused with nitrogen for a creamy stout-like head, topped with caramel salted cream foam.',
    price: 6.25,
    calories: '110 kcal',
    tag: 'Staff Favorite',
    icon: '🧊',
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    id: 'c3',
    category: 'coffee',
    name: 'Spanish Cortado',
    desc: 'Equal parts dark espresso and lightly textured milk with a hint of organic agave and ground Ceylon cinnamon.',
    price: 4.85,
    calories: '90 kcal',
    tag: 'Classic',
    icon: '☕',
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    id: 'c4',
    category: 'coffee',
    name: 'Hazelnut Espresso Tonic',
    desc: 'Fever-Tree Mediterranean tonic poured over hand-pressed espresso with roasted hazelnut essence and fresh orange peel.',
    price: 5.95,
    calories: '80 kcal',
    tag: 'Refreshing',
    icon: '🍸',
    isVegetarian: true,
    isGlutenFree: true,
  },

  // Teas & Coolers
  {
    id: 't1',
    category: 'tea',
    name: 'Ceremonial Iced Matcha Latte',
    desc: 'Stone-ground Uji green tea whisked with silky almond milk, lavender blossoms, and raw wildflower honey.',
    price: 6.50,
    calories: '140 kcal',
    tag: 'Organic',
    icon: '🍵',
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    id: 't2',
    category: 'tea',
    name: 'Blood Orange Hibiscus Cooler',
    desc: 'Steeped Egyptian hibiscus petals with freshly squeezed blood orange juice, sparkling water, and fresh mint sprigs.',
    price: 5.25,
    calories: '65 kcal',
    tag: 'Zero Caffeine',
    icon: '🍹',
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    id: 't3',
    category: 'tea',
    name: 'Spiced London Fog',
    desc: 'Bergamot Earl Grey tea steeped in rich steamed whole milk with crushed cardamom pods and pure vanilla bean.',
    price: 5.50,
    calories: '150 kcal',
    tag: 'Cozy',
    icon: '🫖',
    isVegetarian: true,
    isGlutenFree: true,
  },

  // Bakery & Pastries
  {
    id: 'b1',
    category: 'bakery',
    name: 'Pistachio Cream Brioche Croissant',
    desc: '72-layer cultured butter French croissant filled with velvety Bronte pistachio ganache and toasted slivers.',
    price: 6.75,
    calories: '380 kcal',
    tag: 'Fresh Baked',
    icon: '🥐',
    isVegetarian: true,
    isGlutenFree: false,
  },
  {
    id: 'b2',
    category: 'bakery',
    name: 'Spiced Apple Cardamom Cruffin',
    desc: 'Caramelized Honeycrisp apples baked inside a flaky muffin-shaped croissant dough, dusted with ginger sugar.',
    price: 5.95,
    calories: '320 kcal',
    tag: 'Warm Pastry',
    icon: '🧁',
    isVegetarian: true,
    isGlutenFree: false,
  },
  {
    id: 'b3',
    category: 'bakery',
    name: 'Artisan Sourdough Loaf Slice',
    desc: 'Natural sourdough fermented for 48 hours, served toasted with salted Normandy butter and organic apricot jam.',
    price: 4.50,
    calories: '210 kcal',
    tag: 'Vegan Option',
    icon: '🍞',
    isVegetarian: true,
    isGlutenFree: false,
  },

  // Brunch & Bowls
  {
    id: 'br1',
    category: 'brunch',
    name: 'Avocado & Heirloom Tartine',
    desc: 'Smashed Hass avocados on toasted seeded sourdough, pickled shallots, Persian feta, zaatar, and a 6-minute soft egg.',
    price: 13.50,
    calories: '420 kcal',
    tag: 'Chef Signature',
    icon: '🥑',
    isVegetarian: true,
    isGlutenFree: false,
  },
  {
    id: 'br2',
    category: 'brunch',
    name: 'Wild Acai & Dragonfruit Bowl',
    desc: 'Organic Amazonian acai puree topped with chia seed pudding, toasted coconut flakes, almond butter, and fresh berries.',
    price: 12.25,
    calories: '340 kcal',
    tag: 'Superfood',
    icon: '🍓',
    isVegetarian: true,
    isGlutenFree: true,
  },
  {
    id: 'br3',
    category: 'brunch',
    name: 'Brioche French Toast & Bruleed Fig',
    desc: 'Thick cut brioche soaked in spiced custard, pan-fried in butter, served with caramelized black mission figs and maple.',
    price: 14.50,
    calories: '560 kcal',
    tag: 'Indulgent',
    icon: '🥞',
    isVegetarian: true,
    isGlutenFree: false,
  },

  // Gourmet Lunch
  {
    id: 'g1',
    category: 'gourmet',
    name: 'Truffled Wild Mushroom Melt',
    desc: 'Roasted cremini & oyster mushrooms, aged Gruyere cheese, caramelized leeks, and truffle aioli on grilled sourdough.',
    price: 14.95,
    calories: '510 kcal',
    tag: 'Warm Melt',
    icon: '🥪',
    isVegetarian: true,
    isGlutenFree: false,
  },
  {
    id: 'g2',
    category: 'gourmet',
    name: 'Smoked Salmon & Capers Bagel',
    desc: 'House-cured Norwegian salmon, whipped scallion cream cheese, pickled red onions, baby arugula, and nonpareil capers.',
    price: 15.50,
    calories: '480 kcal',
    tag: 'Fresh Daily',
    icon: '🥯',
    isVegetarian: false,
    isGlutenFree: false,
  },
  {
    id: 'g3',
    category: 'gourmet',
    name: 'Mediterranean Grain & Halloumi Bowl',
    desc: 'Warm farro grains, grilled Cypriot halloumi cheese, roasted baby carrots, marinated chickpeas, and mint tahini drizzle.',
    price: 13.95,
    calories: '460 kcal',
    tag: 'Hearty',
    icon: '🥗',
    isVegetarian: true,
    isGlutenFree: false,
  },
];

// 2. Application State
const state = {
  activeCategory: 'all',
  searchQuery: '',
  vegetarianOnly: false,
  glutenFreeOnly: false,
  orderType: 'Dine-in',
  tipPercentage: 10,
  cart: [], // Array of { id, name, price, qty, icon }
};

// 3. DOM Elements
const menuGrid = document.getElementById('menuGrid');
const categoryNav = document.getElementById('categoryNav');
const menuSearchInput = document.getElementById('menuSearchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const vegOnlyFilter = document.getElementById('vegOnlyFilter');
const glutenFreeFilter = document.getElementById('glutenFreeFilter');
const itemsFoundText = document.getElementById('itemsFoundText');

const orderSidebar = document.getElementById('orderSidebar');
const cartToggleBtn = document.getElementById('cartToggleBtn');
const cartCountBadge = document.getElementById('cartCountBadge');
const cartItemsList = document.getElementById('cartItemsList');
const cartSummary = document.getElementById('cartSummary');
const summarySubtotal = document.getElementById('summarySubtotal');
const summaryTax = document.getElementById('summaryTax');
const summaryTotal = document.getElementById('summaryTotal');
const btnTotalText = document.getElementById('btnTotalText');
const placeOrderBtn = document.getElementById('placeOrderBtn');

const customerName = document.getElementById('customerName');
const tableOrAddress = document.getElementById('tableOrAddress');
const orderNotes = document.getElementById('orderNotes');
const orderTypeBadge = document.getElementById('orderTypeBadge');

const orderSuccessModal = document.getElementById('orderSuccessModal');
const receiptContent = document.getElementById('receiptContent');
const closeModalBtn = document.getElementById('closeModalBtn');
const printReceiptBtn = document.getElementById('printReceiptBtn');
const toastContainer = document.getElementById('toastContainer');

// 4. Initialization
document.addEventListener('DOMContentLoaded', () => {
  loadSavedCart();
  renderMenu();
  setupEventListeners();
  updateCartDisplay();
});

// 5. Render Menu Grid
function renderMenu() {
  const filtered = MENU_DATA.filter((item) => {
    // Category check
    if (state.activeCategory !== 'all' && item.category !== state.activeCategory) {
      return false;
    }
    // Search query check
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchDesc = item.desc.toLowerCase().includes(q);
      if (!matchName && !matchDesc) return false;
    }
    // Dietary checks
    if (state.vegetarianOnly && !item.isVegetarian) return false;
    if (state.glutenFreeOnly && !item.isGlutenFree) return false;

    return true;
  });

  itemsFoundText.textContent = `Showing ${filtered.length} delicious item${filtered.length === 1 ? '' : 's'}`;

  if (filtered.length === 0) {
    menuGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 48px 20px; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px dashed var(--border-strong);">
        <span style="font-size: 40px; display: block; margin-bottom: 8px;">🍽️</span>
        <h4 style="font-size: 18px; margin-bottom: 6px;">No menu items matched your search</h4>
        <p style="color: var(--text-muted); font-size: 13.5px;">Try clearing filters or searching for coffee, croissant, or avocado.</p>
      </div>
    `;
    return;
  }

  menuGrid.innerHTML = filtered.map((item) => {
    return `
      <article class="menu-card" data-id="${item.id}">
        <div class="card-top">
          <div class="item-icon">${item.icon}</div>
          <span class="item-tag">${item.tag}</span>
        </div>
        <h3 class="item-name">${item.name}</h3>
        <p class="item-desc">${item.desc}</p>
        <div class="card-bottom">
          <div>
            <div class="item-price">$${item.price.toFixed(2)}</div>
            <span class="item-calories">${item.calories}</span>
          </div>
          <button class="add-btn" onclick="addToOrder('${item.id}')">
            <span>+ Add</span>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

// 6. Cart Management
function addToOrder(itemId) {
  const item = MENU_DATA.find((m) => m.id === itemId);
  if (!item) return;

  const existing = state.cart.find((c) => c.id === itemId);
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      id: item.id,
      name: item.name,
      price: item.price,
      qty: 1,
      icon: item.icon,
    });
  }

  saveCart();
  updateCartDisplay();
  showToast(`Added ${item.name} to order!`);
}

function updateCartQty(itemId, change) {
  const itemIndex = state.cart.findIndex((c) => c.id === itemId);
  if (itemIndex === -1) return;

  state.cart[itemIndex].qty += change;
  if (state.cart[itemIndex].qty <= 0) {
    state.cart.splice(itemIndex, 1);
  }

  saveCart();
  updateCartDisplay();
}

function updateCartDisplay() {
  const totalCount = state.cart.reduce((sum, item) => sum + item.qty, 0);
  cartCountBadge.textContent = totalCount;

  if (state.cart.length === 0) {
    cartItemsList.innerHTML = `
      <div class="empty-cart-state">
        <span class="empty-icon">☕</span>
        <p style="font-weight:600; margin-bottom:4px;">Your order is empty</p>
        <small>Select delicious items from the menu to get started.</small>
      </div>
    `;
    cartSummary.style.display = 'none';
    return;
  }

  cartSummary.style.display = 'block';

  // Render items
  cartItemsList.innerHTML = state.cart.map((item) => `
    <div class="cart-row">
      <div class="cart-item-details">
        <span class="cart-item-name">${item.icon} ${item.name}</span>
        <span class="cart-item-price">$${(item.price * item.qty).toFixed(2)}</span>
      </div>
      <div class="qty-control">
        <button class="qty-btn" onclick="updateCartQty('${item.id}', -1)" aria-label="Decrease quantity">−</button>
        <span class="qty-num">${item.qty}</span>
        <button class="qty-btn" onclick="updateCartQty('${item.id}', 1)" aria-label="Increase quantity">+</button>
      </div>
    </div>
  `).join('');

  // Calculations
  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * 0.08;
  const tip = subtotal * (state.tipPercentage / 100);
  const total = subtotal + tax + tip;

  summarySubtotal.textContent = `$${subtotal.toFixed(2)}`;
  summaryTax.textContent = `$${tax.toFixed(2)}`;
  summaryTotal.textContent = `$${total.toFixed(2)}`;
  btnTotalText.textContent = `$${total.toFixed(2)}`;
}

function saveCart() {
  try {
    localStorage.setItem('aroma_cart', JSON.stringify(state.cart));
  } catch {}
}

function loadSavedCart() {
  try {
    const saved = localStorage.getItem('aroma_cart');
    if (saved) {
      state.cart = JSON.parse(saved);
    }
  } catch {}
}

// 7. Event Listeners
function setupEventListeners() {
  // Category tabs
  categoryNav.addEventListener('click', (e) => {
    const btn = e.target.closest('.cat-pill');
    if (!btn) return;
    document.querySelectorAll('.cat-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.activeCategory = btn.dataset.category;
    renderMenu();
  });

  // Search
  menuSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim();
    clearSearchBtn.style.display = state.searchQuery ? 'block' : 'none';
    renderMenu();
  });

  clearSearchBtn.addEventListener('click', () => {
    menuSearchInput.value = '';
    state.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    renderMenu();
    menuSearchInput.focus();
  });

  // Dietary
  vegOnlyFilter.addEventListener('change', (e) => {
    state.vegetarianOnly = e.target.checked;
    renderMenu();
  });

  glutenFreeFilter.addEventListener('change', (e) => {
    state.glutenFreeOnly = e.target.checked;
    renderMenu();
  });

  // Dining Mode
  document.querySelectorAll('.type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.orderType = btn.dataset.type;
      orderTypeBadge.textContent = state.orderType;
    });
  });

  // Tip Selector
  document.querySelectorAll('.tip-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tip-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.tipPercentage = parseInt(btn.dataset.tip, 10);
      updateCartDisplay();
    });
  });

  // Place Order
  placeOrderBtn.addEventListener('click', handlePlaceOrder);

  // Close Modal
  closeModalBtn.addEventListener('click', () => {
    orderSuccessModal.style.display = 'none';
    state.cart = [];
    saveCart();
    updateCartDisplay();
  });

  printReceiptBtn.addEventListener('click', () => {
    window.print();
  });

  // Scroll to Order button for mobile
  cartToggleBtn.addEventListener('click', () => {
    orderSidebar.scrollIntoView({ behavior: 'smooth' });
  });
}

// 8. Place Order Action
function handlePlaceOrder() {
  if (state.cart.length === 0) {
    showToast('Please add items to your order first!');
    return;
  }

  const nameVal = customerName.value.trim();
  if (!nameVal) {
    customerName.focus();
    customerName.style.borderColor = '#c0392b';
    showToast('Please enter a customer name to place order.');
    return;
  }
  customerName.style.borderColor = '';

  const tableVal = tableOrAddress.value.trim() || (state.orderType === 'Dine-in' ? 'Table 4' : 'Express Pickup');
  const notesVal = orderNotes.value.trim();

  const subtotal = state.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * 0.08;
  const tip = subtotal * (state.tipPercentage / 100);
  const total = subtotal + tax + tip;
  const orderId = 'AO-' + Math.floor(100000 + Math.random() * 900000);
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Build receipt html
  receiptContent.innerHTML = `
    <div class="receipt-header">
      <h4>AROMA &amp; OAK CAFE</h4>
      <div>440 Market Square • Artisanal Kitchen</div>
      <div>Date: ${new Date().toLocaleDateString()} • Time: ${timestamp}</div>
      <div style="font-weight:bold; margin-top:4px;">TICKET: #${orderId} (${state.orderType})</div>
    </div>
    <div style="margin-bottom:8px;">
      <div><strong>Customer:</strong> ${escapeHtml(nameVal)}</div>
      <div><strong>Destination:</strong> ${escapeHtml(tableVal)}</div>
      ${notesVal ? `<div><strong>Kitchen Notes:</strong> <em>${escapeHtml(notesVal)}</em></div>` : ''}
    </div>
    <div style="border-top:1px dashed #bbb; padding-top:6px; margin-bottom:6px;">
      ${state.cart.map((i) => `
        <div class="receipt-row">
          <span>${i.qty}x ${escapeHtml(i.name)}</span>
          <span>$${(i.price * i.qty).toFixed(2)}</span>
        </div>
      `).join('')}
    </div>
    <div style="border-top:1px dashed #bbb; padding-top:6px;">
      <div class="receipt-row">
        <span>Subtotal:</span>
        <span>$${subtotal.toFixed(2)}</span>
      </div>
      <div class="receipt-row">
        <span>Kitchen Tax (8%):</span>
        <span>$${tax.toFixed(2)}</span>
      </div>
      <div class="receipt-row">
        <span>Staff Tip (${state.tipPercentage}%):</span>
        <span>$${tip.toFixed(2)}</span>
      </div>
      <div class="receipt-row receipt-total">
        <span>TOTAL PAID:</span>
        <span>$${total.toFixed(2)}</span>
      </div>
    </div>
    <div style="text-align:center; margin-top:12px; font-size:11px; color:#555;">
      Estimated Prep Time: ~8-12 minutes.<br>
      Thank you for dining with us!
    </div>
  `;

  orderSuccessModal.style.display = 'flex';
}

// 9. Toast Helper
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Expose functions globally for inline onclick
window.addToOrder = addToOrder;
window.updateCartQty = updateCartQty;
