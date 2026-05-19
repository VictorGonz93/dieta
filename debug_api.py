#!/usr/bin/env python3
import urllib.request
import json

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=bread&page_size=5&json=1'

req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})

try:
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode())
        
        print(f"✅ Status: {response.status}")
        print(f"📦 Total products: {len(data.get('products', []))}")
        
        # Show first product structure
        if data.get('products'):
            p = data['products'][0]
            print(f"\n🔍 FIRST PRODUCT STRUCTURE:")
            print(f"  Name: {p.get('product_name')}")
            print(f"  Brands: {p.get('brands')}")
            print(f"  Has 'nutriments' key: {'nutriments' in p}")
            
            if 'nutriments' in p:
                print(f"  Nutriments keys: {list(p['nutriments'].keys())}")
                print(f"  energy_kcal: {p['nutriments'].get('energy_kcal')}")
                print(f"  proteins: {p['nutriments'].get('proteins')}")
                print(f"  carbohydrates: {p['nutriments'].get('carbohydrates')}")
                print(f"  fat: {p['nutriments'].get('fat')}")
                
                print(f"\n  Full nutriments:")
                for k, v in list(p['nutriments'].items())[:10]:
                    print(f"    {k}: {v}")
            
            print(f"\n📋 All keys in first product:")
            print(f"  {list(p.keys())}")
            
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
