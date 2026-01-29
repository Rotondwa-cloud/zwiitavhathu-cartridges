<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ink & Toner | Zwiitavhathu Cartridges</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      background: #f5f5f5;
      color: #111;
    }

    header {
      background: #fff;
      border-bottom: 1px solid #ddd;
      padding: 16px 32px;
      display: flex;
      align-items: center;
      gap: 32px;
    }

    header h1 {
      font-size: 22px;
      margin: 0;
    }

    .hero {
      background: linear-gradient(90deg, #3dd5f3, #8be9ff);
      padding: 40px 32px;
    }

    .hero h2 {
      font-size: 36px;
      margin: 0 0 10px 0;
    }

    .hero p {
      font-size: 18px;
      margin: 0;
    }

    .layout {
      display: grid;
      grid-template-columns: 260px 1fr;
      gap: 24px;
      padding: 32px;
    }

    /* FILTERS */
    .filters {
      background: #fff;
      padding: 20px;
      border: 1px solid #ddd;
    }

    .filters h3 {
      margin-top: 0;
      font-size: 18px;
    }

    .filters input {
      width: 100%;
      padding: 8px;
      margin: 10px 0;
    }

    .filters label {
      display: block;
      margin: 8px 0;
      font-size: 14px;
    }

    /* PRODUCTS GRID */
    .products {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }

    .card {
      background: #fff;
      border: 1px solid #ddd;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .card img {
      width: 100%;
      height: 180px;
      object-fit: contain;
      background: #f0f0f0;
      margin-bottom: 16px;
    }

    .card h4 {
      font-size: 16px;
      margin: 0 0 8px 0;
    }

    .card p {
      font-size: 14px;
      color: #444;
      flex-grow: 1;
    }

    .card ul {
      padding-left: 16px;
      font-size: 13px;
    }

    .card button {
      margin-top: 12px;
      padding: 10px;
      background: #000;
      color: #fff;
      border: none;
      cursor: pointer;
    }

    .card button:hover {
      background: #333;
    }

    /* ORDER MODAL */
    #orderModal {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: none;
      align-items: center;
      justify-content: center;
    }

    .modal {
      background: #fff;
      width: 420px;
      padding: 24px;
    }

    .modal h3 {
      margin-top: 0;
    }

    .modal input {
      width: 100%;
      padding: 10px;
      margin: 8px 0;
    }

    .modal button {
      width: 100%;
      padding: 12px;
      background: #000;
      color: #fff;
      border: none;
      margin-top: 10px;
    }
  </style>
</head>
<body>

<header>
  <h1>Zwiitavhathu Cartridges</h1>
</header>

<section class="hero">
  <h2>Ink and Toner</h2>
  <p>Print experiences that amaze with original cartridges.</p>
</section>

<section class="layout">

  <!-- FILTERS -->
  <aside class="filters">
    <h3>Filter</h3>
    <input type="text" placeholder="Enter printer model" />
    <label><input type="checkbox" checked /> In Stock</label>
  </aside>

  <!-- PRODUCTS -->
  <div class="products" id="products">

    <div class="card">
      <img src="https://i.imgur.com/V8KQyZk.png" alt="HP 44A" />
      <h4>HP 44A Black Original LaserJet Toner (CF244A)</h4>
      <p>Ideal for 1–3 users printing less than 1,000 pages per month.</p>
      <ul>
        <li>Standard Capacity</li>
        <li>Black</li>
      </ul>
      <button onclick="order('HP 44A Black Toner')">Order</button>
    </div>

    <div class="card">
      <img src="https://i.imgur.com/qFz1jH6.png" alt="HP 728" />
      <h4>HP 728 130‑ml Matte Black (3WX25A)</h4>
      <p>Designed for CAD and general‑purpose applications.</p>
      <ul>
        <li>Ink Cartridge</li>
        <li>Matte Black</li>
      </ul>
      <button onclick="order('HP 728 Matte Black')">Order</button>
    </div>

    <div class="card">
      <img src="https://i.imgur.com/7n2cLZ8.png" alt="HP 147X" />
      <h4>HP 147X High Yield Black Toner (W1470X)</h4>
      <p>High‑volume printing for enterprise environments.</p>
      <ul>
        <li>High Capacity</li>
        <li>Black</li>
      </ul>
      <button onclick="order('HP 147X High Yield Toner')">Order</button>
    </div>

  </div>
</section>

<!-- ORDER MODAL -->
<div id="orderModal">
  <div class="modal">
    <h3 id="productName"></h3>
    <input id="name" placeholder="Your Name" />
    <input id="email" placeholder="Your Email" />
    <input id="qty" type="number" placeholder="Quantity" />
    <button onclick="submitOrder()">Submit Order</button>
  </div>
</div>

<script>
  let selectedProduct = '';

  function order(product) {
    selectedProduct = product;
    document.getElementById('productName').innerText = product;
    document.getElementById('orderModal').style.display = 'flex';
  }

  async function submitOrder() {
    const payload = {
      product: selectedProduct,
      name: name.value,
      email: email.value,
      quantity: qty.value
    };

    await fetch('/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    alert('Order sent successfully');
    document.getElementById('orderModal').style.display = 'none';
  }
</script>

</body>
</html>
