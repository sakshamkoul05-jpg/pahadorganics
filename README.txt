PAHAD ORGANICS - WEBSITE (real multi-page static site)
======================================================

WHAT THIS IS
------------
A plain multi-page website. Every tab is its OWN .html file, linked with
normal links - no app, no routing tricks, nothing to install.

Pages:
  index.html       Home
  shop.html        Shop (all products, search + category filter on that page)
  story.html       Our Story
  himalayas.html   From the Himalayas
  impact.html      Impact
  contact.html     Contact & How to Order
  product-*.html   One page per product (11 products)

HOW TO PUT IT ONLINE
--------------------
1. Unzip pahad-organics-site.zip
2. Upload ALL the files and folders (keeping the same structure:
   .html files together, with the assets/ and css/ folders next to them)
   to any static host - for example Netlify Drop, Vercel, GitHub Pages,
   or a folder/subdomain on pahadtrust.org hosting.
3. Open index.html - every tab and product link works as a normal page.

ORDERS
------
Every Order button opens WhatsApp on +91 82199 85362 with the product
name pre-written. The full catalogue link is https://wa.me/c/918219985362

TO CHANGE SOMETHING
-------------------
Product names, prices and page text live in generate.py (the PRODUCTS
list at the top). Edit there and run:  python3 generate.py
It regenerates all pages and css/style.css consistently.
To use the exact WhatsApp catalogue photos later, replace the files in
assets/ (keep the same file names) - no other change is needed.

Photos are PAHAD's own real photos from pahadtrust.org. Prices are from
Pahad Organics' published price list. Turmeric and Chamba Walnuts show
"Price on WhatsApp" because no published price exists for them.

NOTE (GitHub/Vercel version): Product and brand photos are loaded live from PAHAD Trust's own image server (the same source pahadtrust.org uses), so this repo contains only HTML/CSS. The fully self-contained version with local image files is in the pahad-organics-site.zip archive.
