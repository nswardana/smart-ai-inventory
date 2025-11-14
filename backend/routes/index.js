const express = require('express');
const router = express.Router();

const productRoute = require('./products');
const salesRoute = require('./sales');
const forecastRoute = require('./forecast');

router.use('/products', productRoute);
router.use('/sales', salesRoute);
router.use('/forecast', forecastRoute);

module.exports = router;
