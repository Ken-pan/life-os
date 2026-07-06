-- Seed QA test user with Amazon transactions + purchase_enrichment for UI screenshots.
-- Safe to re-run: deletes prior QA rows first.

delete from public.finance_transactions
where user_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  and platform_id like 'qa-amazon-enrich-%';

insert into public.finance_transactions (
  user_id,
  txn_date,
  occurred_on,
  merchant,
  merchant_name,
  category,
  normalized_category,
  account,
  source_account_label,
  flow,
  flow_type,
  amount,
  source_amount,
  budget_impact,
  in_spending,
  include_in_spending_analytics,
  in_cash_flow,
  include_in_cash_flow_history,
  source,
  review_status,
  review_flags,
  capture_source,
  platform_id,
  purchase_enrichment
)
values
  (
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    '2026-07-03',
    '2026-07-03',
    'Amazon Purchase',
    'Amazon Purchase',
    'Shopping',
    'Shopping',
    'Chase Sapphire',
    'Chase Sapphire',
    'expense',
    'expense',
    33.42,
    33.42,
    -33.42,
    true,
    true,
    true,
    true,
    'import',
    'resolved',
    '[]'::jsonb,
    'qa_amazon_enrichment',
    'qa-amazon-enrich-20260703-3342',
    '{
      "source": "amazon",
      "orderId": "114-2839702-0661859",
      "orderDate": "2026-07-02",
      "orderTotal": 33.42,
      "status": "Arriving tomorrow",
      "detailUrl": "https://www.amazon.com/gp/your-account/order-details?orderID=114-2839702-0661859",
      "lineItems": [
        {"title": "16oz Ajinomoto Umami Seasoning, MSG Monosodium Glutamate", "detailUrl": "https://www.amazon.com/dp/B00I0M99MU"},
        {"title": "HOTO Mini Bike Tire Pump, 150PSI Portable Electric Bike Air Pump", "detailUrl": "https://www.amazon.com/dp/B0DCG1JGKN"}
      ],
      "matchConfidence": "high",
      "matchedAt": "2026-07-06T23:00:00.000Z"
    }'::jsonb
  ),
  (
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    '2026-06-30',
    '2026-06-30',
    'Amazon Purchase',
    'Amazon Purchase',
    'Shopping',
    'Shopping',
    'Chase Sapphire',
    'Chase Sapphire',
    'expense',
    'expense',
    55.34,
    55.34,
    -55.34,
    true,
    true,
    true,
    true,
    'import',
    'resolved',
    '[]'::jsonb,
    'qa_amazon_enrichment',
    'qa-amazon-enrich-20260630-5534',
    '{
      "source": "amazon",
      "orderId": "114-3407542-8223433",
      "orderDate": "2026-06-28",
      "orderTotal": 55.34,
      "status": "Delivered June 30",
      "detailUrl": "https://www.amazon.com/gp/your-account/order-details?orderID=114-3407542-8223433",
      "lineItems": [
        {"title": "Optimum Nutrition Gold Standard 100% Whey Protein Powder, Banana Cream, 5 Pound", "detailUrl": "https://www.amazon.com/dp/B0015R3AOA"},
        {"title": "Nutricost Casein Protein Powder 5lb - Micellar Casein, Unflavored", "detailUrl": "https://www.amazon.com/dp/B08HSSFB2X"},
        {"title": "CeraVe SA Lotion for Rough & Bumpy Skin, 19 Ounce", "detailUrl": "https://www.amazon.com/dp/B07VW4CY47"}
      ],
      "matchConfidence": "high",
      "matchedAt": "2026-07-06T23:00:00.000Z"
    }'::jsonb
  ),
  (
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    '2026-05-19',
    '2026-05-19',
    'Amazon Purchase',
    'Amazon Purchase',
    'Shopping',
    'Shopping',
    'Chase Sapphire',
    'Chase Sapphire',
    'expense',
    'expense',
    15.47,
    15.47,
    -15.47,
    true,
    true,
    true,
    true,
    'import',
    'resolved',
    '[]'::jsonb,
    'qa_amazon_enrichment',
    'qa-amazon-enrich-20260519-1547',
    '{
      "source": "amazon",
      "orderId": "114-5521794-2509821",
      "orderDate": "2026-05-15",
      "orderTotal": 15.47,
      "status": "Delivered May 19",
      "detailUrl": "https://www.amazon.com/gp/your-account/order-details?orderID=114-5521794-2509821",
      "lineItems": [
        {"title": "Cheerble Pumpless Dog Water Elfin Fountain, 4L/135 oz", "detailUrl": "https://www.amazon.com/dp/B0GFVBZGTF"},
        {"title": "ClearSpace Oversized Moving Bags, 6 Pack", "detailUrl": "https://www.amazon.com/dp/B0CGXT9PGR"}
      ],
      "matchConfidence": "high",
      "matchedAt": "2026-07-06T23:00:00.000Z"
    }'::jsonb
  );
