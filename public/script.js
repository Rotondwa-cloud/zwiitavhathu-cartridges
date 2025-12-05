
// ===============================
// InkZone Shop Script
// ===============================

// Load products dynamically on the products page
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const products = await response.json();

    const productList = document.getElementById('product-list');
    if (!productList) return;

    if (products.length === 0) {
      productList.innerHTML = "<p>No products available at the moment.</p>";
      return;
    }

    // Build HTML for each product
    productList.innerHTML = products.map(p => `
      <div class="product-card">
        <img src="${p.image}" alt="${p.name}">
        <h3>${p.name}</h3>
        <p>Price: <strong>R${p.price}</strong></p>
        <button class="order-btn" onclick="showOrderForm('${p.name}', ${p.price})">Order</button>
      </div>
    `).join('');

  } catch (error) {
    console.error("Error loading products:", error);
  }
}

// ===============================
// Order Form Popup
// ===============================

// Create popup dynamically
function showOrderForm(productName, price) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';

  // Create popup content
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.innerHTML = `
    <h2>Order ${productName}</h2>
    <p>Price: R${price}</p>
    <form id="orderForm">
      <input type="hidden" name="product" value="${productName}">
      <label>Your Name:</label>
      <input type="text" name="customerName" required>
      <label>Email Address:</label>
      <input type="email" name="email" required>
      <label>Quantity:</label>
      <input type="number" name="quantity" min="1" value="1" required>
      <button type="submit" class="order-btn">Place Order</button>
      <button type="button" class="cancel-btn">Cancel</button>
    </form>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Close popup
  popup.querySelector('.cancel-btn').addEventListener('click', () => {
    overlay.remove();
  });

  // Submit order
  popup.querySelector('#orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const order = Object.fromEntries(formData.entries());

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });

      if (res.ok) {
        alert(`✅ Order placed successfully for ${order.product}!`);
        overlay.remove();
      } else {
        alert('⚠️ Failed to place order. Please try again.');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      alert('⚠️ An error occurred while placing the order.');
    }
  });
}

// ===============================
// Auto-load products when needed
// ===============================
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('product-list')) {
    loadProducts();
  }
});
=======
// ===============================
// InkZone Shop Script
// ===============================

// Load products dynamically on the products page
async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const products = await response.json();

    const productList = document.getElementById('product-list');
    if (!productList) return;

    if (products.length === 0) {
      productList.innerHTML = "<p>No products available at the moment.</p>";
      return;
    }

    // Build HTML for each product
    productList.innerHTML = products.map(p => `
      <div class="product-card">
        <img src="${p.image}" alt="${p.name}">
        <h3>${p.name}</h3>
        <p>Price: <strong>R${p.price}</strong></p>
        <button class="order-btn" onclick="showOrderForm('${p.name}', ${p.price})">Order</button>
      </div>
    `).join('');

  } catch (error) {
    console.error("Error loading products:", error);
  }
}

// ===============================
// Order Form Popup
// ===============================

// Create popup dynamically
function showOrderForm(productName, price) {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'popup-overlay';

  // Create popup content
  const popup = document.createElement('div');
  popup.className = 'popup';
  popup.innerHTML = `
    <h2>Order ${productName}</h2>
    <p>Price: R${price}</p>
    <form id="orderForm">
      <input type="hidden" name="product" value="${productName}">
      <label>Your Name:</label>
      <input type="text" name="customerName" required>
      <label>Email Address:</label>
      <input type="email" name="email" required>
      <label>Quantity:</label>
      <input type="number" name="quantity" min="1" value="1" required>
      <button type="submit" class="order-btn">Place Order</button>
      <button type="button" class="cancel-btn">Cancel</button>
    </form>
  `;

  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  // Close popup
  popup.querySelector('.cancel-btn').addEventListener('click', () => {
    overlay.remove();
  });

  // Submit order
  popup.querySelector('#orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const order = Object.fromEntries(formData.entries());

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });

      if (res.ok) {
        alert(`✅ Order placed successfully for ${order.product}!`);
        overlay.remove();
      } else {
        alert('⚠️ Failed to place order. Please try again.');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      alert('⚠️ An error occurred while placing the order.');
    }
  });
}

// ===============================
// Auto-load products when needed
// ===============================
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('product-list')) {
    loadProducts();
  }
});

