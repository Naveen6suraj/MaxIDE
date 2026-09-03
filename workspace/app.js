const menuItems = [
    {
        id: 1,
        name: "Classic Cheeseburger",
        category: "burger",
        price: 12.99,
        description: "Juicy beef patty with melted cheddar, lettuce, and special sauce.",
        image: "https://images.unsplash.com/photo-1568901346375-23c9450c58kk?auto=format&fit=crop&w=500&q=80"
    },
    {
        id: 2,
        name: "Pepperoni Feast",
        category: "pizza",
        price: 15.99,
        description: "Double pepperoni with extra mozzarella and fresh basil.",
        image: "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=500&q=80"
    },
    {
        id: 3,
        name: "Salmon Nigiri Set",
        category: "sushi",
        price: 18.50,
        description: "Fresh Atlantic salmon over seasoned sushi rice.",
        image: "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=500&q=80"
    },
    {
        id: 4,
        name: "Chocolate Lava Cake",
        category: "dessert",
        price: 8.99,
        description: "Warm chocolate cake with a gooey center and vanilla ice cream.",
        image: "https://images.unsplash.com/photo-1624353365286-3f8d62f65679?auto=format&fit=crop&w=500&q=80"
    },
    {
        id: 5,
        name: "Bacon BBQ Burger",
        category: "burger",
        price: 14.50,
        description: "Smoky BBQ sauce, crispy bacon, and caramelized onions.",
        image: "https://images.unsplash.com/photo-1553979459-d2229ba7a175?auto=format&fit=crop&w=500&q=80"
    },
    {
        id: 6,
        name: "Margherita Pizza",
        category: "pizza",
        price: 13.00,
        description: "Classic tomato sauce, fresh mozzarella, and basil leaves.",
        image: "https://images.unsplash.com/photo-1574071318508-1cdbad877579?auto=format&fit=crop&w=500&q=80"
    },
    {
        id: 7,
        name: "California Roll",
        category: "sushi",
        price: 14.00,
        description: "Crab, avocado, and cucumber wrapped in seaweed and rice.",
        image: "https://images.unsplash.com/photo-1559703248-dcaaec9fab78?auto=format&fit=crop&w=500&q=80"
    },
    {
        id: 8,
        name: "New York Cheesecake",
        category: "dessert",
        price: 7.50,
        description: "Creamy cheesecake with a graham cracker crust and berry coulis.",
        image: "https://images.unsplash.com/photo-1533134242471-777177677677?auto=format&fit=crop&w=500&q=80"
    }
];

let cart = [];

function initMenu() {
    const menuGrid = document.getElementById('menu-grid');
    const filterBtns = document.querySelectorAll('.filter-btn');

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderMenu(btn.dataset.filter);
        });
    });

    renderMenu('all');
}

function renderMenu(filter) {
    const menuGrid = document.getElementById('menu-grid');
    menuGrid.innerHTML = '';

    const filteredItems = filter === 'all' 
        ? menuItems 
        : menuItems.filter(item => item.category === filter);

    filteredItems.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'menu-item';
        
        // Use a reliable fallback image if the primary one fails
        const imgHtml = `<img src="${item.image}" alt="${item.name}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1493770348161-369560ae357d?auto=format&fit=crop&w=500&q=80';">`;
        
        itemEl.innerHTML = `
            ${imgHtml}
            <div class="menu-item-info">
                <h3>${item.name}</h3>
                <p>${item.description}</p>
                <div class="menu-item-footer">
                    <span class="price">$${item.price.toFixed(2)}</span>
                    <button class="add-to-cart" onclick="addToCart(${item.id})">Add to Cart</button>
                </div>
            </div>
        `;
        menuGrid.appendChild(itemEl);
    });
}

function addToCart(id) {
    const item = menuItems.find(i => i.id === id);
    const existingItem = cart.find(i => i.id === id);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...item, quantity: 1 });
    }

    updateCart();
}

function updateCart() {
    const cartItemsEl = document.getElementById('cart-items');
    const cartCountEl = document.getElementById('cart-count');
    const cartTotalEl = document.getElementById('cart-total');

    cartItemsEl.innerHTML = '';
    let total = 0;
    let count = 0;

    cart.forEach(item => {
        total += item.price * item.quantity;
        count += item.quantity;

        const itemEl = document.createElement('div');
        itemEl.className = 'cart-item';
        itemEl.innerHTML = `
            <div class="cart-item-info">
                <h4>${item.name}</h4>
                <p>$${item.price.toFixed(2)} x ${item.quantity}</p>
            </div>
            <div class="cart-item-actions">
                <button onclick="changeQuantity(${item.id}, -1)">-</button>
                <button onclick="changeQuantity(${item.id}, 1)">+</button>
            </div>
        `;
        cartItemsEl.appendChild(itemEl);
    });

    cartCountEl.innerText = count;
    cartTotalEl.innerText = `$${total.toFixed(2)}`;
}

function changeQuantity(id, delta) {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            cart = cart.filter(i => i.id !== id);
        }
        updateCart();
    }
}

function toggleCart() {
    document.getElementById('cart-sidebar').classList.toggle('active');
}

function checkout() {
    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }
    alert('Thank you for your order! Your food is on the way! 🍔🍕');
    cart = [];
    updateCart();
    toggleCart();
}

document.addEventListener('DOMContentLoaded', initMenu);