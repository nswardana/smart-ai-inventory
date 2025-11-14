const express = require('express');
const router = express.Router();
const { Sale } = require('../models/database');
const { fetchSales } = require('../services/odooAPI');

// list sales
router.get('/', async (req,res)=>{
  const sales = await Sale.findAll({ limit: 200, order:[['date','DESC']]});
  res.json(sales);
});

// sync external sales to DB
router.post('/sync', async (req,res)=>{
  try{
    const data = await fetchSales();
    for(const tx of data){
      const date = tx.date || null;
      for(const line of tx.lines||[]){
        await Sale.create({
          external_sale_id: tx.id,
          sale_name: tx.name,
          product_name: line.full_product_name,
          qty: line.qty,
          subtotal: Number(line.price_subtotal||0),
          date: date
        });
      }
    }
    res.json({ok:true, imported: data.length});
  }catch(e){
    console.error(e);
    res.status(500).json({error:e.message});
  }
});

module.exports = router;
