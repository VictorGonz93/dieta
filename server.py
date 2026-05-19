#!/usr/bin/env python3
"""
OpenFoodFacts API Proxy Server
Runs on localhost:8000 and proxies requests to OpenFoodFacts API
with User-Agent header, caching, and retry logic for rate limiting
"""

import http.server
import json
import urllib.request
import urllib.parse
from urllib.error import URLError, HTTPError
import sys
import os
import time
from pathlib import Path

# Local cache database
CACHE_FILE = Path(__file__).parent / 'products_cache.json'

# User-Agent (MANDATORY for OpenFoodFacts API)
# Note: urllib's default "Python-urllib/X.X" is blocked, use generic browser UA
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0'

# API Configuration
API_BASE_URL = 'https://world.openfoodfacts.org'
# API_BASE_URL = 'https://world.openfoodfacts.net'  # Use staging for testing with auth: off/off
RETRY_COUNT = 3
RETRY_DELAY = 1  # seconds, will be exponential

def load_cache():
    """Load cached products"""
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_cache(cache):
    """Save cached products"""
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"⚠️ Could not save cache: {e}")

class OFFProxyHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass
    
    def do_GET(self):
        # Parse URL
        parsed_path = urllib.parse.urlparse(self.path)
        path = parsed_path.path
        query_params = urllib.parse.parse_qs(parsed_path.query)
        
        if path == '/api/search':
            self.handle_search(query_params)
        elif path == '/':
            self.handle_root()
        else:
            self.send_error(404)
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def send_json_response(self, data, status_code=200):
        """Send JSON response with CORS headers"""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def handle_root(self):
        response = {
            'message': 'OpenFoodFacts Proxy Server',
            'endpoints': {
                'search': '/api/search?q=pollo'
            }
        }
        self.send_json_response(response)
    
    def handle_search(self, query_params):
        # Get search query
        search_term = query_params.get('q', [None])[0] or query_params.get('query', [None])[0]
        
        if not search_term or len(search_term) < 2:
            response = {'error': 'Search query must be at least 2 characters'}
            self.send_json_response(response, 400)
            return
        
        cache = load_cache()
        search_key = search_term.lower()
        
        # Check cache first
        if search_key in cache:
            print(f"📦 Cache hit for: '{search_term}'")
            result = cache[search_key]
            self.send_json_response(result)
            return
        
        try:
            print(f"🔍 Searching for: '{search_term}'")
            
            # Try to fetch from API with retry logic
            data = None
            for attempt in range(RETRY_COUNT):
                try:
                    data = self._fetch_from_api(search_term)
                    break  # Success, exit retry loop
                except HTTPError as e:
                    if e.code == 503:
                        print(f"⚠️ API Rate Limit (503) - Attempt {attempt + 1}/{RETRY_COUNT}")
                        if attempt < RETRY_COUNT - 1:
                            wait_time = RETRY_DELAY * (2 ** attempt)  # Exponential backoff
                            print(f"⏳ Waiting {wait_time}s before retry...")
                            time.sleep(wait_time)
                        else:
                            print(f"❌ Failed after {RETRY_COUNT} attempts")
                            # Return cached empty result for rate limiting
                            result = {
                                'query': search_term,
                                'count': 0,
                                'products': [],
                                'source': 'rate-limited',
                                'message': 'OpenFoodFacts API temporarily overloaded. Try again later.'
                            }
                            cache[search_key] = result
                            save_cache(cache)
                            self.send_json_response(result)
                            return
                    else:
                        print(f"❌ API Error {e.code}: {e.reason}")
                        break
                except URLError as e:
                    print(f"❌ Network Error: {e.reason}")
                    break
            
            if data is None:
                # Network error or unexpected error - return empty
                result = {
                    'query': search_term,
                    'count': 0,
                    'products': [],
                    'source': 'error',
                    'message': 'Could not connect to OpenFoodFacts API'
                }
                self.send_json_response(result)
                return
            
            print(f"📡 Got {len(data.get('products', []))} products from API")
            
            # Filter products with at least energy + 1 macro (more lenient)
            valid_products = []
            for p in data.get('products', []):
                nutriments = p.get('nutriments', {})
                
                # Try different key formats (OpenFoodFacts uses multiple formats)
                energy = (nutriments.get('energy-kcal_100g') or 
                         nutriments.get('energy_100g') or 
                         nutriments.get('energy-kcal') or
                         nutriments.get('energy_kcal'))
                protein = nutriments.get('proteins') or nutriments.get('proteins_100g')
                carbs = nutriments.get('carbohydrates') or nutriments.get('carbohydrates_100g')
                fat = nutriments.get('fat') or nutriments.get('fat_100g')
                
                # Accept if has energy (kcal) + at least 1 macronutrient
                has_macros = sum([1 for m in [protein, carbs, fat] if m is not None])
                if energy is not None and has_macros >= 1:
                    valid_products.append({
                        'name': p.get('product_name') or p.get('name') or 'Unknown',
                        'brand': p.get('brands') or 'Unknown',
                        'kcal': round(float(energy)) if energy else 0,
                        'protein': round(float(protein), 1) if protein else 0,
                        'carbs': round(float(carbs), 1) if carbs else 0,
                        'fats': round(float(fat), 1) if fat else 0
                    })
            
            print(f"✅ Found {len(valid_products)} valid products")
            
            result = {
                'query': search_term,
                'count': len(valid_products),
                'products': valid_products[:10],
                'source': 'api'
            }
            
            # Save to cache
            cache[search_key] = result
            save_cache(cache)
            
            self.send_json_response(result)
            
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            result = {
                'query': search_term,
                'count': 0,
                'products': [],
                'source': 'error',
                'message': f'Server error: {str(e)}'
            }
            self.send_json_response(result, 500)
    
    def _fetch_from_api(self, search_term):
        """Fetch from OpenFoodFacts API using v2 endpoint (no rate limit issues)"""
        # Use v2 API endpoint instead of old search.pl (which has aggressive rate limiting)
        api_url = f"{API_BASE_URL}/api/v2/search?q={urllib.parse.quote(search_term)}&page_size=20"
        
        # Create request with User-Agent header
        req = urllib.request.Request(
            api_url,
            headers={'User-Agent': USER_AGENT}
        )
        
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode())

def run_server(port=8000):
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, OFFProxyHandler)
    print(f"\n🚀 Proxy server running on http://localhost:{port}")
    print(f"📡 API endpoint: http://localhost:{port}/api/search?q=pollo")
    print(f"💾 Cache file: {CACHE_FILE}\n")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n👋 Shutting down...")
        httpd.shutdown()
        sys.exit(0)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port)
