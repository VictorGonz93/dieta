#!/usr/bin/env python3
"""Test OpenFoodFacts API with different User-Agent approaches"""

import urllib.request
import json
import sys

def test_user_agent(user_agent_string, description):
    """Test API with specific User-Agent"""
    print(f"\n{description}")
    print(f"  User-Agent: {user_agent_string}")
    url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=apple&page_size=10&json=1'
    
    req = urllib.request.Request(url, headers={'User-Agent': user_agent_string})
    
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            print(f'  ✅ Status: {response.status}')
            print(f'     Products: {len(data.get("products", []))}')
            return True
    except Exception as e:
        print(f'  ❌ Error: {type(e).__name__}: {str(e)[:50]}')
        return False

if __name__ == '__main__':
    print("Testing different User-Agent strategies:")
    
    # Test different User-Agents
    test_user_agent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        "1. Generic Mozilla User-Agent"
    )
    
    test_user_agent(
        'Python-urllib/3.10',
        "2. Python-urllib default"
    )
    
    test_user_agent(
        'NutritionTracker/1.0 (contact@example.com)',
        "3. Custom app User-Agent"
    )
    
    test_user_agent(
        'App/1.0',
        "4. Simple App format"
    )
    
    # Test without User-Agent
    print("\n5. NO User-Agent (default Python)")
    print("  User-Agent: (default)")
    url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=apple&page_size=10&json=1'
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            print(f'  ✅ Status: {response.status}')
            print(f'     Products: {len(data.get("products", []))}')
    except Exception as e:
        print(f'  ❌ Error: {type(e).__name__}: {str(e)[:50]}')
