#!/usr/bin/env python3
import urllib.request
import json

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
url = 'https://world.openfoodfacts.org/api/v2/search?q=apple&page_size=2'

req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode())
        
        print(f"🔍 TOP LEVEL KEYS:")
        print(f"  {list(data.keys())}")
        
        # Check where products are
        if 'products' in data:
            print(f"\n📦 Found 'products' key with {len(data['products'])} items")
            p = data['products'][0]
            print(f"\n🏷️ FIRST PRODUCT STRUCTURE:")
            print(f"  Name: {p.get('product_name', p.get('name'))}")
            print(f"  Brands: {p.get('brands')}")
            print(f"  Has 'nutriments': {'nutriments' in p}")
            if 'nutriments' in p:
                nuts = p['nutriments']
                print(f"  nutriments keys: {list(nuts.keys())[:10]}...")
                print(f"  energy_100g: {nuts.get('energy_100g')}")
                print(f"  proteins_100g: {nuts.get('proteins_100g')}")
                print(f"  carbohydrates_100g: {nuts.get('carbohydrates_100g')}")
                print(f"  fat_100g: {nuts.get('fat_100g')}")
        
        if 'results' in data:
            print(f"\n📦 Found 'results' key with {len(data['results'])} items")
            
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
