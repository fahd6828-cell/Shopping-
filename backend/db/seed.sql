-- ============================================================================
--  Souqly — Seed data for local development
--  Stores, shipping rates, sample coupons, and one sample product with
--  listings + history so every query path can be exercised immediately.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Stores
-- ----------------------------------------------------------------------------
INSERT INTO stores (slug, name, name_ar, website_url, url_pattern, country_code, currency, affiliate_tag, logo_url) VALUES
('amazon-sa', 'Amazon Saudi Arabia', 'أمازون السعودية', 'https://www.amazon.sa',  '^https://(www\.)?amazon\.sa/',  'SA', 'SAR', 'souqly-21', 'https://cdn.souqly.app/logos/amazon-sa.png'),
('amazon-ae', 'Amazon UAE',          'أمازون الإمارات', 'https://www.amazon.ae',  '^https://(www\.)?amazon\.ae/',  'AE', 'AED', 'souqly-21', 'https://cdn.souqly.app/logos/amazon-ae.png'),
('noon',      'Noon',                'نون',             'https://www.noon.com',   '^https://(www\.)?noon\.com/',   'AE', 'AED', 'souqly',    'https://cdn.souqly.app/logos/noon.png'),
('namshi',    'Namshi',              'نمشي',            'https://www.namshi.com', '^https://(www\.)?namshi\.com/', 'AE', 'AED', NULL,        'https://cdn.souqly.app/logos/namshi.png');

-- ----------------------------------------------------------------------------
-- Shipping rates (store → destination country)
-- ----------------------------------------------------------------------------
INSERT INTO shipping_rates (store_id, destination_country, base_cost, currency, free_shipping_threshold, est_days_min, est_days_max) VALUES
-- Amazon SA
((SELECT id FROM stores WHERE slug = 'amazon-sa'), 'SA', 12.00, 'SAR', 200.00, 1, 3),
((SELECT id FROM stores WHERE slug = 'amazon-sa'), 'AE', 35.00, 'SAR', NULL,   3, 7),
((SELECT id FROM stores WHERE slug = 'amazon-sa'), 'KW', 45.00, 'SAR', NULL,   4, 9),
((SELECT id FROM stores WHERE slug = 'amazon-sa'), 'EG', 60.00, 'SAR', NULL,   5, 12),
-- Amazon AE
((SELECT id FROM stores WHERE slug = 'amazon-ae'), 'AE', 10.00, 'AED', 100.00, 1, 3),
((SELECT id FROM stores WHERE slug = 'amazon-ae'), 'SA', 30.00, 'AED', NULL,   3, 7),
((SELECT id FROM stores WHERE slug = 'amazon-ae'), 'KW', 40.00, 'AED', NULL,   4, 9),
((SELECT id FROM stores WHERE slug = 'amazon-ae'), 'EG', 55.00, 'AED', NULL,   5, 12),
-- Noon
((SELECT id FROM stores WHERE slug = 'noon'), 'AE', 10.00, 'AED', 100.00, 1, 2),
((SELECT id FROM stores WHERE slug = 'noon'), 'SA', 12.00, 'SAR', 100.00, 1, 3),
((SELECT id FROM stores WHERE slug = 'noon'), 'EG', 25.00, 'EGP', 250.00, 2, 5),
-- Namshi
((SELECT id FROM stores WHERE slug = 'namshi'), 'AE', 12.00, 'AED', 150.00, 1, 3),
((SELECT id FROM stores WHERE slug = 'namshi'), 'SA', 15.00, 'SAR', 200.00, 2, 4),
((SELECT id FROM stores WHERE slug = 'namshi'), 'KW',  3.00, 'KWD', 15.00,  2, 5);

-- ----------------------------------------------------------------------------
-- Coupons
-- ----------------------------------------------------------------------------
INSERT INTO coupons (store_id, code, description_ar, description_en, discount_type, discount_value, min_order_value, valid_from, valid_until, is_verified, success_count, fail_count, last_verified_at) VALUES
((SELECT id FROM stores WHERE slug = 'amazon-sa'), 'SOUQLY10',  'خصم 10% على الإلكترونيات (حتى 100 ريال)', '10% off electronics (max SAR 100)', 'percent', 10, 100.00, now() - interval '10 days', now() + interval '50 days', TRUE, 342, 12, now() - interval '1 day'),
((SELECT id FROM stores WHERE slug = 'amazon-sa'), 'BANK25',    'خصم 25 ريال عند الدفع ببطاقات مختارة',    'SAR 25 off with selected bank cards',  'fixed',   25,  200.00, now() - interval '5 days',  now() + interval '25 days', TRUE, 128,  9, now() - interval '2 days'),
((SELECT id FROM stores WHERE slug = 'amazon-ae'), 'UAE15',     'خصم 15% على الموضة',                       '15% off fashion',                      'percent', 15,  150.00, now() - interval '3 days',  now() + interval '30 days', TRUE,  89,  4, now() - interval '1 day'),
((SELECT id FROM stores WHERE slug = 'noon'),      'NOON20',    'خصم 20% للمستخدمين الجدد',                 '20% off for new users',                'percent', 20,   50.00, now() - interval '30 days', now() + interval '60 days', TRUE, 971, 55, now()),
((SELECT id FROM stores WHERE slug = 'noon'),      'SHIPFREE',  'شحن مجاني بدون حد أدنى',                   'Free shipping, no minimum',            'free_shipping', 0, NULL, now() - interval '7 days', now() + interval '14 days', TRUE, 233, 18, now() - interval '3 days'),
((SELECT id FROM stores WHERE slug = 'noon'),      'OLD50',     'خصم 50 درهم (منتهي)',                      'AED 50 off (expired)',                 'fixed',   50,  300.00, now() - interval '90 days', now() - interval '10 days', TRUE, 410, 30, now() - interval '20 days'),
((SELECT id FROM stores WHERE slug = 'namshi'),    'NAMSHI30',  'خصم 30% على الملابس',                      '30% off apparel',                      'percent', 30,  NULL,   now() - interval '2 days',  now() + interval '20 days', TRUE,  67,  2, now() - interval '1 day'),
((SELECT id FROM stores WHERE slug = 'namshi'),    'UNTESTED5', 'خصم 5% (غير مؤكد)',                        '5% off (unverified)',                  'percent',  5,  NULL,   now(),                      now() + interval '30 days', FALSE,  0,  0, NULL);

-- ----------------------------------------------------------------------------
-- Sample product + listings + price history (iPhone 16 128GB)
-- ----------------------------------------------------------------------------
WITH p AS (
    INSERT INTO products (canonical_name, name_ar, brand, category, model_number, image_url)
    VALUES ('Apple iPhone 16 128GB', 'آيفون 16 - 128 جيجابايت', 'Apple', 'electronics', 'MYE93', 'https://cdn.souqly.app/products/iphone-16.png')
    RETURNING id
),
l AS (
    INSERT INTO product_listings (product_id, store_id, store_product_url, store_sku, current_price, currency)
    SELECT p.id, s.store_id, s.url, s.sku, s.price, s.currency
    FROM p,
    (VALUES
        ((SELECT id FROM stores WHERE slug = 'amazon-sa'), 'https://www.amazon.sa/dp/B0DGHV3J5K', 'B0DGHV3J5K', 3399.00, 'SAR'),
        ((SELECT id FROM stores WHERE slug = 'amazon-ae'), 'https://www.amazon.ae/dp/B0DGHV3J5K', 'B0DGHV3J5K', 3299.00, 'AED'),
        ((SELECT id FROM stores WHERE slug = 'noon'),      'https://www.noon.com/uae-en/N70106183V/p', 'N70106183V', 3249.00, 'AED')
    ) AS s (store_id, url, sku, price, currency)
    RETURNING id, current_price, currency
)
-- Two history points per listing: a week-old higher price, then today's price,
-- so price-drop queries have something to find.
INSERT INTO price_history (listing_id, price, currency, recorded_at)
SELECT id, current_price * 1.06, currency, now() - interval '7 days' FROM l
UNION ALL
SELECT id, current_price, currency, now() FROM l;

COMMIT;
