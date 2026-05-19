#!/usr/bin/env python3
import urllib.request
import urllib.parse
import json
import time

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

endpoints = [
    # Current endpoint
    ('search.pl', 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=bread&page_size=5&json=1'),
    # Search simple endpoint
    ('search_simple', 'https://world.openfoodfacts.org/api/v2/search?q=bread&page_size=5'),
    # v3 endpoint
    ('v3', 'https://world.openfoodfacts.org/api/v3/products/search?q=bread&page_size=5'),
]

for name, url in endpoints:
    print(f"\n🔍 Testing: {name}")
    print(f"   URL: {url}")
    
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            
            products = data.get('products', data.get('results', []))
            print(f"   ✅ Status: {response.status}")
            print(f"   📦 Products: {len(products)}")
            
            if products:
                p = products[0]
                print(f"   🏷️ First: {p.get('product_name', p.get('name', 'Unknown'))}")
                print(f"   📊 Has nutriments: {bool(p.get('nutriments'))}")
                
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    time.sleep(2)  # Wait between requests

print("\n✅ Done!")
