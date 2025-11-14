const express = require('express');
const router = express.Router();
const { Product } = require('../models/database');
const { fetchProducts } = require('../services/odooAPI');

// list products from local DB
router.get('/', async (req, res) => {
  const products = await Product.findAll();
  res.json(products);
});

// fetch from external API and upsert
router.post('/sync', async (req, res) => {
  try{
    const data = await fetchProducts();
    // data expected [{name, lines:[{id,name,qty}]}]
    for(const wh of data){
      for(const line of wh.lines||[]){
        await Product.upsert({
          external_id: line.id,
          name: line.name,
          qty: line.qty,
          warehouse: wh.name
        }, {where:{external_id: line.id}});
      }
    }
    res.json({ok:true});
  }catch(e){
    console.error(e);
    res.status(500).json({error:e.message});
  }
});

module.exports = router;
