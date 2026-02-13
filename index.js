const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();
const { Cashfree } = require('cashfree-pg');

const app = express();

const allowedOrigin =
  process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_ORIGIN          
    : 'http://localhost:8006';             
app.use(
  cors({
    origin: allowedOrigin,
    credentials: false,                     
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function generateOrderId() {
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256');
  hash.update(uniqueId);
  const order_Id = hash.digest('hex');
  return order_Id.substr(0, 12);
}


const isProdCashfree = process.env.CASHFREE_ENV === 'production';

const cfEnv = isProdCashfree ? Cashfree.PRODUCTION : Cashfree.SANDBOX;

const cashfree = new Cashfree(
  cfEnv,
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET
);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cashfree_env: isProdCashfree ? 'production' : 'sandbox',
    frontend_origin: allowedOrigin,
  });
});

app.get('/payment', async (req, res) => {
  try {
    const request = {
      order_id: await generateOrderId(),
      order_amount: 1.0,
      order_currency: 'INR',
      customer_details: {
        customer_id: 'webcodder01',
        customer_phone: '9999999999',
        customer_name: 'test user',
        customer_email: 'testUser@gmail.com',
      },
      order_meta: {
        // for production, set FRONTEND_BASE_URL in .env
        return_url: `${
          process.env.FRONTEND_BASE_URL || 'http://localhost:8006'
        }/payment-success?order_id={order_id}`,
      },
    };

    const response = await cashfree.PGCreateOrder(request);

    console.log('Order created:', response.data);

    return res.json({
      payment_session_id: response.data.payment_session_id,
      order_id: response.data.order_id,
    });
  } catch (error) {
    console.error(
      'Create order error:',
      error.response?.data || error.message || error
    );
    return res.status(500).json({
      error: 'Create order failed',
      details: process.env.NODE_ENV === 'production'
        ? undefined
        : error.response?.data,
    });
  }
});
// 1. Change to POST
app.post('/payment', async (req, res) => {
  try {
    // 2. Destructure data from frontend
    const { amount, customer_name, customer_phone, customer_email } = req.body;

    const request = {
      order_id: await generateOrderId(),
      order_amount: amount, // Dynamic amount
      order_currency: 'INR',
      customer_details: {
        customer_id: `cust_${Date.now()}`,
        customer_phone: customer_phone,
        customer_name: customer_name,
        customer_email: customer_email,
      },
      order_meta: {
        // Updated to point to your frontend
        return_url: `${process.env.FRONTEND_BASE_URL || 'http://localhost:8006'}/`, 
      },
    };

    const response = await cashfree.PGCreateOrder(request);
    console.log('Order created:', response.data);
    return res.json({
      payment_session_id: response.data.payment_session_id,
      order_id: response.data.order_id,
      
    });
    
  } catch (error) {
    console.error('Order Error:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});
app.post('/verify', async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const response = await cashfree.PGOrderFetchPayments(orderId);

    const payments = response.data;
    const successPayment = payments.find(
      (p) => p.payment_status === 'SUCCESS'
    );

    if (!successPayment) {
      return res.json({
        success: false,
        message: 'Payment not successful yet',
        payments:
          process.env.NODE_ENV === 'production' ? undefined : payments,
      });
    }

    return res.json({
      success: true,
      order_id: orderId,
      amount: successPayment.order_amount,
      currency: successPayment.order_currency,
      customer_name: successPayment.customer_details?.customer_name,
      customer_phone: successPayment.customer_details?.customer_phone,
      customer_email: successPayment.customer_details?.customer_email,
      payment_status: successPayment.payment_status,
    });
  } catch (error) {
    console.log(error.response?.data || error.message || error);
    return res.status(500).json({
      error: 'Verify failed',
      details: process.env.NODE_ENV === 'production'
        ? undefined
        : error.response?.data,
    });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
