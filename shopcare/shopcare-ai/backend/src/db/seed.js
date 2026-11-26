const bcrypt = require('bcrypt');
const { pool, withTransaction } = require('./pool');
const { runMigrations } = require('./migrate');
const logger = require('../config/logger');

const daysAgo = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
};

async function seedDatabase({ closePool = false } = {}) {
  await runMigrations();

  await withTransaction(async (client) => {
    const staffHash = await bcrypt.hash('Staff123!', 10);
    const aliceHash = await bcrypt.hash('Customer123!', 10);
    const bobHash = await bcrypt.hash('Customer123!', 10);

    // Upsert users
    const staffRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'staff')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
       RETURNING id`,
      ['Priya Sharma (Support Lead)', 'staff@demo.com', staffHash]
    );
    const aliceRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'customer')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
       RETURNING id`,
      ['Alice Verma', 'alice@demo.com', aliceHash]
    );
    const bobRes = await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'customer')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
       RETURNING id`,
      ['Bob Nair', 'bob@demo.com', bobHash]
    );

    const staffId = staffRes.rows[0].id;
    const aliceId = aliceRes.rows[0].id;
    const bobId = bobRes.rows[0].id;

    // Clear operational demo tables for repeatable clean seeding
    await client.query('DELETE FROM audit_logs');
    await client.query('DELETE FROM escalations');
    await client.query('DELETE FROM refunds');
    await client.query('DELETE FROM messages');
    await client.query('DELETE FROM tickets');
    await client.query('DELETE FROM orders');

    // Seed Orders (all edge cases in INR ₹)
    const ordersData = [
      {
        order_number: 'ORD-1001',
        customer_id: aliceId,
        status: 'delivered',
        delivery_date: daysAgo(4),
        total_amount: 1499.0,
        item_details: {
          name: 'boAt Airdopes 141 Wireless Earbuds',
          category: 'Electronics & Accessories',
          quantity: 1,
          unit_price: 1499.0,
          return_window_days: 15,
        },
      },
      {
        order_number: 'ORD-1002',
        customer_id: aliceId,
        status: 'delivered',
        delivery_date: daysAgo(3),
        total_amount: 12999.0,
        item_details: {
          name: 'Sony WH-CH720N Noise Cancelling Headphones',
          category: 'Electronics & Accessories',
          quantity: 1,
          unit_price: 12999.0,
          return_window_days: 15,
        },
      },
      {
        order_number: 'ORD-1003',
        customer_id: aliceId,
        status: 'delivered',
        delivery_date: daysAgo(45),
        total_amount: 2499.0,
        item_details: {
          name: 'Anker 65W GaN Fast Charger',
          category: 'Electronics & Accessories',
          quantity: 1,
          unit_price: 2499.0,
          return_window_days: 15,
        },
      },
      {
        order_number: 'ORD-1004',
        customer_id: aliceId,
        status: 'shipped',
        delivery_date: null,
        total_amount: 1899.0,
        item_details: {
          name: 'Cotton Linen Casual Shirt',
          category: 'Apparel & Footwear',
          quantity: 1,
          unit_price: 1899.0,
          return_window_days: 30,
        },
      },
      {
        order_number: 'ORD-1005',
        customer_id: aliceId,
        status: 'delivered',
        delivery_date: daysAgo(6),
        total_amount: 899.0,
        item_details: {
          name: 'Logitech USB-C Braided Cable Pack',
          category: 'Electronics & Accessories',
          quantity: 1,
          unit_price: 899.0,
          return_window_days: 15,
        },
      },
      {
        order_number: 'ORD-2001',
        customer_id: bobId,
        status: 'delivered',
        delivery_date: daysAgo(5),
        total_amount: 3499.0,
        item_details: {
          name: 'Nike Revolution Running Shoes',
          category: 'Apparel & Footwear',
          quantity: 1,
          unit_price: 3499.0,
          return_window_days: 30,
        },
      },
      {
        order_number: 'ORD-2002',
        customer_id: bobId,
        status: 'processing',
        delivery_date: null,
        total_amount: 18999.0,
        item_details: {
          name: 'Samsung Galaxy Tab A9',
          category: 'Smartphones & Tablets',
          quantity: 1,
          unit_price: 18999.0,
          return_window_days: 10,
        },
      },
    ];

    const orderMap = {};
    for (const o of ordersData) {
      const res = await client.query(
        `INSERT INTO orders (order_number, customer_id, status, delivery_date, total_amount, item_details)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, order_number`,
        [
          o.order_number,
          o.customer_id,
          o.status,
          o.delivery_date,
          o.total_amount,
          JSON.stringify(o.item_details),
        ]
      );
      orderMap[o.order_number] = res.rows[0].id;
    }

    // Seed Ticket 1: Escalated high-value refund (> ₹5,000) for Alice
    const t1Res = await client.query(
      `INSERT INTO tickets (ticket_number, customer_id, order_id, subject, description, category, status, priority)
       VALUES ($1, $2, $3, $4, $5, $6, 'escalated', 'high')
       RETURNING id`,
      [
        'TKT-1001',
        aliceId,
        orderMap['ORD-1002'],
        'Defective Sony Headphones - Requesting Refund',
        'Left earcup has crackling noise on my ORD-1002 Sony headphones. Need a refund of ₹12,999.',
        'Refund Request',
      ]
    );
    const t1Id = t1Res.rows[0].id;

    await client.query(
      `INSERT INTO messages (ticket_id, sender_type, content, metadata)
       VALUES
       ($1, 'customer', $2, $3),
       ($1, 'ai', $4, $5)`,
      [
        t1Id,
        'Hi, my Sony headphones from order ORD-1002 have a crackling left earcup. Please refund ₹12,999.',
        JSON.stringify({}),
        'I checked order **ORD-1002** (Sony WH-CH720N Noise Cancelling Headphones, ₹12,999.00, delivered within the 15-day Electronics & Accessories return window). Because the requested refund amount of **₹12,999.00** exceeds the **₹5,000** automated refund limit, I have escalated your ticket to our support staff for priority human review.',
        JSON.stringify({
          tool_calls: [
            { tool: 'get_order_details', order_number: 'ORD-1002' },
            { tool: 'search_return_policy', category: 'Electronics & Accessories' },
            { tool: 'escalate_to_human', priority: 'high' },
          ],
          citations: ['electronics_return_policy.md', 'general_refund_and_escalation_policy.md'],
        }),
      ]
    );

    const escRes = await client.query(
      `INSERT INTO escalations (ticket_id, summary, priority, assigned_to, decision, internal_note)
       VALUES ($1, $2, 'high', $3, 'pending', $4)
       RETURNING id`,
      [
        t1Id,
        'High-value refund request (₹12,999.00 > ₹5,000 threshold) for order ORD-1002 (Sony WH-CH720N, delivered 3 days ago, within 15-day window).',
        staffId,
        'Awaiting staff approval for high-value electronics defect return.',
      ]
    );

    // Seed Ticket 2: Approved standard refund (<= ₹5,000) for Alice on ORD-1005
    const t2Res = await client.query(
      `INSERT INTO tickets (ticket_number, customer_id, order_id, subject, description, category, status, priority)
       VALUES ($1, $2, $3, $4, $5, $6, 'resolved', 'low')
       RETURNING id`,
      [
        'TKT-1002',
        aliceId,
        orderMap['ORD-1005'],
        'Damaged USB-C Cable Pack',
        'One cable in ORD-1005 arrived frayed. Requesting refund of ₹899.',
        'Refund Request',
      ]
    );
    const t2Id = t2Res.rows[0].id;

    await client.query(
      `INSERT INTO messages (ticket_id, sender_type, content, metadata)
       VALUES
       ($1, 'customer', $2, $3),
       ($1, 'ai', $4, $5)`,
      [
        t2Id,
        'One cable in order ORD-1005 arrived damaged. Can I get a refund of ₹899?',
        JSON.stringify({}),
        'Your order **ORD-1005** (Logitech USB-C Braided Cable Pack, ₹899.00) was delivered within the 15-day Electronics & Accessories return window and is within the ₹5,000 automated refund threshold. Your refund of **₹899.00** has been approved and queued.',
        JSON.stringify({
          tool_calls: [
            { tool: 'get_order_details', order_number: 'ORD-1005' },
            { tool: 'search_return_policy', category: 'Electronics & Accessories' },
            { tool: 'process_refund', amount: 899 },
          ],
          citations: ['electronics_return_policy.md', 'general_refund_and_escalation_policy.md'],
        }),
      ]
    );

    const refRes = await client.query(
      `INSERT INTO refunds (order_id, ticket_id, amount, reason, status, idempotency_key, requested_by)
       VALUES ($1, $2, 899.00, $3, 'approved', $4, $5)
       RETURNING id`,
      [
        orderMap['ORD-1005'],
        t2Id,
        'Damaged cable on arrival',
        `seed-refund-${orderMap['ORD-1005']}`,
        aliceId,
      ]
    );

    // Seed Ticket 3: Open ticket for Bob (to demonstrate cross-customer isolation)
    const t3Res = await client.query(
      `INSERT INTO tickets (ticket_number, customer_id, order_id, subject, description, category, status, priority)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', 'medium')
       RETURNING id`,
      [
        'TKT-2001',
        bobId,
        orderMap['ORD-2001'],
        'Size Exchange / Return Query',
        'Checking return eligibility for my Nike Revolution Running Shoes (ORD-2001).',
        'General Inquiry',
      ]
    );
    await client.query(
      `INSERT INTO messages (ticket_id, sender_type, content, metadata)
       VALUES ($1, 'customer', $2, $3)`,
      [
        t3Res.rows[0].id,
        'Hi, can I return my running shoes from ORD-2001 if the size does not fit?',
        JSON.stringify({}),
      ]
    );

    // Seed Audit Logs
    await client.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, actor_id, details)
       VALUES
       ('escalation', $1, 'escalation.created', $3, $4),
       ('refund', $2, 'refund.auto_approved', $5, $6)`,
      [
        escRes.rows[0].id,
        refRes.rows[0].id,
        aliceId,
        JSON.stringify({ ticket_number: 'TKT-1001', order_number: 'ORD-1002', amount: 12999 }),
        aliceId,
        JSON.stringify({ ticket_number: 'TKT-1002', order_number: 'ORD-1005', amount: 899 }),
      ]
    );
  });

  logger.info('Database seeded successfully');
  if (closePool) {
    await pool.end();
  }
}

if (require.main === module) {
  seedDatabase({ closePool: true })
    .then(() => process.exit(0))
    .catch(async (err) => {
      console.error('Seed failed:', err);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { seedDatabase };
