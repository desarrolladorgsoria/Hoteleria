const express = require('express');
const fs = require('fs');
const path = require('path');
const Stripe = require('stripe');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Rutas de archivos
const DATA_PATH = path.join(__dirname, 'data', 'datos.json');
const CONFIG_PATH = path.join(__dirname, 'data', 'configuracion.json');

// Leer configuración para obtener clave de Stripe
function leerConfig() {
 try {
  const config = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(config);
 } catch (error) {
  console.error('Error leyendo configuracion.json:', error);
  return {};
 }
}

// Inicializar Stripe con clave secreta
const config = leerConfig();
const stripe = Stripe(config.stripe?.secret_key || '');

// ============ LEER DATOS ============
function leerDatos() {
 try {
  const data = fs.readFileSync(DATA_PATH, 'utf8');
  return JSON.parse(data);
 } catch (error) {
  console.error('Error leyendo datos.json:', error);
  return { habitaciones: [], experiencias: [], servicios: [], reservas: [] };
 }
}

function guardarDatos(datos) {
 fs.writeFileSync(DATA_PATH, JSON.stringify(datos, null, 2), 'utf8');
}

function guardarConfig(config) {
 fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

// ============ ENDPOINTS PÚBLICOS ============

// Obtener configuración (con clave pública de Stripe)
app.get('/api/config', (req, res) => {
 const config = leerConfig();
 // Enviamos solo la clave pública al frontend
 res.json({
  ...config,
  stripe: {
   public_key: config.stripe?.public_key || ''
  }
 });
});

// Obtener datos
app.get('/api/datos', (req, res) => {
 const datos = leerDatos();
 res.json(datos);
});

// ============ ENDPOINTS PROTEGIDOS ============

// Verificar contraseña del admin
app.post('/api/verificar', (req, res) => {
 const { password } = req.body;
 const config = leerConfig();
 const adminPassword = config.admin?.seguridad?.contraseña || 'admin123';
 
 if (password === adminPassword) {
  res.json({ success: true });
 } else {
  res.json({ success: false, error: 'Contraseña incorrecta' });
 }
});

// Guardar datos completos (admin)
app.post('/api/guardar-datos', (req, res) => {
 const { password, datos } = req.body;
 const config = leerConfig();
 const adminPassword = config.admin?.seguridad?.contraseña || 'admin123';
 
 if (password !== adminPassword) {
  return res.status(401).json({ success: false, error: 'No autorizado' });
 }
 
 try {
  guardarDatos(datos);
  res.json({ success: true });
 } catch (error) {
  res.status(500).json({ success: false, error: error.message });
 }
});

// Guardar configuración (admin)
app.post('/api/guardar-config', (req, res) => {
 const { password, config } = req.body;
 const adminPassword = leerConfig().admin?.seguridad?.contraseña || 'admin123';
 
 if (password !== adminPassword) {
  return res.status(401).json({ success: false, error: 'No autorizado' });
 }
 
 try {
  guardarConfig(config);
  res.json({ success: true });
 } catch (error) {
  res.status(500).json({ success: false, error: error.message });
 }
});

// ============ ENDPOINTS DE PAGO ============

// Crear intención de pago con Stripe
app.post('/api/crear-pago', async (req, res) => {
 const { amount, currency, description, metadata } = req.body;
 
 try {
  const paymentIntent = await stripe.paymentIntents.create({
   amount: Math.round(amount * 100), // Stripe usa centavos
   currency: currency || 'usd',
   description: description || 'Reserva de hotel',
   metadata: metadata || {},
   automatic_payment_methods: {
    enabled: true,
   },
  });
  
  res.json({
   success: true,
   clientSecret: paymentIntent.client_secret,
   paymentIntentId: paymentIntent.id
  });
 } catch (error) {
  console.error('Error creando payment intent:', error);
  res.status(500).json({ success: false, error: error.message });
 }
});

// Confirmar reserva después del pago exitoso
app.post('/api/confirmar-reserva', (req, res) => {
 const { reserva, paymentIntentId } = req.body;
 
 try {
  const datos = leerDatos();
  const nuevaReserva = {
   id: Date.now(),
   ...reserva,
   payment_intent_id: paymentIntentId,
   fecha_reserva: new Date().toISOString(),
   estado: 'confirmada'
  };
  datos.reservas.push(nuevaReserva);
  guardarDatos(datos);
  res.json({ success: true, reserva: nuevaReserva });
 } catch (error) {
  res.status(500).json({ success: false, error: error.message });
 }
});

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
 console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
});