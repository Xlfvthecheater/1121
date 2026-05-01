require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// License keys
const keys = [
  'x1qgcgc643kd7jzct09ygljryhrk1jnaghbw','wumftoqx0clwlh1rkrb2dx5muafupyt7b5yy',
  'rlw8jyf3zlms6v8eryje8adkaqrocndqoapc','jt14pp9740i3mwdsmur2g80z6ln3hh7i3gvo',
  '8c4wbafppgahynb4msi2go2422b859pf2mli','fhgajgwl97ou3e4h8l1snaxrcb2ihu3vl4t6',
  'hvls8spd7nkh4p2uldblkgk4guc6zllpgqv2','o02xr11gua5idrbbr37w0pt6k7vhgls4f4kt',
  'z2oeb3alz2hu4q8plbkely9f8twiwq4itpwb','egql6f172fa4rulbnmm7mkcrbi1pklncklp2',
  'im7szagpdmjlhjosz4flshd7xpxqxdxkxa4e','96j8fy5kvaxse9s9l8ywqf52s10gz9xdc911',
  'ls2uy41doi73djqyg4gdwpil76nr0vdznhm9','v0smq80y4tuwvu7qewr2avz9ydx71iysqjsl',
  'u0fp7ogocmk0emhelbqsk57e7a5pl7jen5ch'
];
let usedIndex = 0;

// Create Stripe Checkout Session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { email, plan } = req.body;

    console.log('Received request:', { email, plan });

    // Determine price based on plan
    let priceId;
    switch(plan) {
      case '1 Day':
        priceId = process.env.STRIPE_PRICE_1DAY;
        break;
      case '1 Week':
        priceId = process.env.STRIPE_PRICE_1WEEK;
        break;
      case '1 Month':
        priceId = process.env.STRIPE_PRICE_1MONTH;
        break;
      default:
        priceId = process.env.STRIPE_PRICE_1DAY;
    }

    console.log('Using price ID:', priceId);

    const successUrl = `${req.protocol}://${req.get('host')}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${req.protocol}://${req.get('host')}/wory.html`;

    console.log('URLs:', { successUrl, cancelUrl });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        plan: plan,
        email: email
      }
    });

    // Generate license key
    const key = keys[usedIndex % keys.length];
    usedIndex++;

    console.log(`Checkout session created for ${email}, plan: ${plan}, key: ${key}`);

    // Send email with license key using EmailJS API
    try {
      const emailParams = {
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: email,
          license_key: key,
          plan: plan
        }
      };

      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailParams)
      });

      if (response.ok) {
        console.log('Email sent successfully to:', email);
      } else {
        console.error('EmailJS API error:', await response.text());
      }
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }

    res.json({ id: session.id });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    console.error('Error details:', JSON.stringify(error, null, 2));
    res.status(500).json({ error: error.message });
  }
});

// Stripe Webhook handler
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.metadata.email;
    const plan = session.metadata.plan;

    // Generate license key
    const key = keys[usedIndex % keys.length];
    usedIndex++;

    console.log(`Payment successful for ${email}, plan: ${plan}, key: ${key}`);

    // Send email with license key using EmailJS API
    try {
      const emailParams = {
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY,
        template_params: {
          to_email: email,
          license_key: key,
          plan: plan
        }
      };

      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailParams)
      });

      if (response.ok) {
        console.log('Email sent successfully to:', email);
      } else {
        console.error('EmailJS API error:', await response.text());
      }
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
    }
  }

  res.json({ received: true });
});

// Get session details (for success page)
app.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
