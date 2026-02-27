require("dotenv").config();
const axios = require("axios");

// For testing purposes, bypass SSL certificate validation
// WARNING: Do not use in production
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const shopifyStore = process.env.SHOPIFY_STORE.replace(".myshopify.com", "");
const SHOPIFY_ENDPOINT = `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products.json`;

async function fetchFromGraphQL() {
    const query = `
    query {
      getSystemMetalListing {
        edges {
          node {
            id
            productNumber
            name
            manufacturer
            laserType
            shortDescription
            longDescription
            buildVolumeLength
            buildVolumeWidth
            buildVolumeHeight
            pressureValueBar
            powerConsumptionMax
            powerConsumptionTypical
            volumeFlowRate
            scanSpeed
            highSpeedScannerCount
            lightEngineCount
            laserCount
            fThetaLenseCount
            images {
              image {
                ... on asset {
                  id
                  filename
                  fullpath
                }
              }
            }
            image_sds {
              image {
                ... on asset {
                  id
                  filename
                  fullpath
                }
              }
            }
          }
        }
      }
      getSystemPolymerListing {
        edges {
          node {
            id
            productNumber
            name
            shortDescription
            longDescription
            buildVolumeLength
            buildVolumeWidth
            buildVolumeHeight
            powerConsumptionMax
            powerConsumptionTypical
            weight
            scanSpeed
            highSpeedScannerCount
            fThetaLenseCount
            laserCount
            laserType
            images {
              image {
                ... on asset {
                  id
                  filename
                  fullpath
                }
              }
            }
            image_sds {
              image {
                ... on asset {
                  id
                  filename
                  fullpath
                }
              }
            }
          }
        }
      }
    }
    `;

    try {
        const response = await axios.post(
            process.env.GRAPHQL_API_URL,
            { query },
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": process.env.EOS_API_KEY,
                    "Authorization": process.env.EOS_AUTH_BASIC,
                    "Accept": "application/json"
                },
                timeout: 15000
            }
        );

        const data = response.data.data;
        const products = [];

        console.log("📊 RAW GraphQL Data received. Mapping products...");

        // Map Metal Systems
        if (data.getSystemMetalListing && data.getSystemMetalListing.edges) {
            data.getSystemMetalListing.edges.forEach(edge => {
                products.push({
                    ...edge.node,
                    type: "Metal System",
                    vendor: edge.node.manufacturer || "EOS"
                });
            });
        }

        // Map Polymer Systems
        if (data.getSystemPolymerListing && data.getSystemPolymerListing.edges) {
            data.getSystemPolymerListing.edges.forEach(edge => {
                products.push({
                    ...edge.node,
                    type: "Polymer System",
                    vendor: "EOS"
                });
            });
        }

        return products;
    } catch (error) {
        console.error("❌ Failed to fetch from GraphQL:", error.response?.data || error.message);
        throw error;
    }
}

async function downloadImageAsBase64(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: {
                "Authorization": process.env.EOS_AUTH_BASIC
            }
        });
        return Buffer.from(response.data, 'binary').toString('base64');
    } catch (error) {
        console.error(`      [ERROR] Failed to download image from ${url}:`, error.message);
        return null;
    }
}

async function pushToShopify(product) {
    const toInch = (mm) => (mm * 0.0393701).toFixed(1);
    let buildVolumeText = "";
    if (product.buildVolumeLength === product.buildVolumeWidth && product.buildVolumeLength > 0) {
        buildVolumeText = `Ø ${product.buildVolumeLength} × ${product.buildVolumeHeight} mm (Ø ${toInch(product.buildVolumeLength)} × ${toInch(product.buildVolumeHeight)} in)`;
    } else {
        buildVolumeText = `${product.buildVolumeLength || 0} × ${product.buildVolumeWidth || 0} × ${product.buildVolumeHeight || 0} mm (${toInch(product.buildVolumeLength || 0)} × ${toInch(product.buildVolumeWidth || 0)} × ${toInch(product.buildVolumeHeight || 0)} in)`;
    }

    const title = (product.name || "Unnamed Product").replace(/\r?\n|\r/g, " ").trim();
    const specs = [];
    if (product.laserType) specs.push(`<li>Laser Type: ${product.laserType}</li>`);
    if (product.laserCount) specs.push(`<li>Laser Count: ${product.laserCount}</li>`);
    if (product.scanSpeed) specs.push(`<li>Scan Speed: ${product.scanSpeed}</li>`);
    if (product.powerConsumptionMax) specs.push(`<li>Power Consumption (Max): ${product.powerConsumptionMax}</li>`);
    if (product.buildVolumeLength) specs.push(`<li>${buildVolumeText}</li>`);

    const description = `
        <p>${product.shortDescription || ""}</p>
        <p>${product.longDescription || ""}</p>
        <p><strong>Specifications:</strong></p>
        <ul>
            ${specs.join("\n            ")}
        </ul>
    `;

    // Map Images (using base64 attachment strategy)
    const images = [];
    if (product.images) {
        const imgSets = Array.isArray(product.images) ? product.images : [product.images];
        for (let i = 0; i < imgSets.length; i++) {
            const imgSet = imgSets[i];
            if (imgSet && imgSet.image && imgSet.image.fullpath) {
                let path = imgSet.image.fullpath;
                if (!path.startsWith('http')) {
                    const baseUrl = "https://eos:preview@staging.eos.info";
                    path = (path.startsWith('/') ? baseUrl : `${baseUrl}/`) + path;
                }

                console.log(`      [FETCH] Downloading image for base64: ${path}`);
                const base64 = await downloadImageAsBase64(path);
                if (base64) {
                    images.push({
                        attachment: base64,
                        filename: imgSet.image.filename || `image_${i}.jpg`
                    });
                }
            }
        }
    }

    // Handle image_sds (can be object or array)
    if (product.image_sds) {
        const sdsSets = Array.isArray(product.image_sds) ? product.image_sds : [product.image_sds];
        for (let i = 0; i < sdsSets.length; i++) {
            const imgSet = sdsSets[i];
            if (imgSet && imgSet.image && imgSet.image.fullpath) {
                let path = imgSet.image.fullpath;
                if (!path.startsWith('http')) {
                    const baseUrl = "https://eos:preview@staging.eos.info";
                    path = (path.startsWith('/') ? baseUrl : `${baseUrl}/`) + path;
                }

                console.log(`      [FETCH] Downloading SDS image for base64: ${path}`);
                const base64 = await downloadImageAsBase64(path);
                if (base64) {
                    images.push({
                        attachment: base64,
                        filename: imgSet.image.filename || `sds_image_${i}.jpg`
                    });
                }
            }
        }
    }

    if (images.length > 0) {
        console.log(`   📸 Found ${images.length} images for "${product.name}" (converted to base64)`);
    } else {
        console.log(`   📷 No images found for "${product.name}"`);
    }

    const shopifyPayload = {
        product: {
            title: title,
            body_html: description.trim(),
            vendor: product.vendor,
            product_type: product.type,
            images: images,
            variants: [
                {
                    price: "0.00",
                    sku: String(product.productNumber || product.id)
                }
            ]
        }
    };

    const currentIdValue = String(product.productNumber || product.id);
    console.log(`📡 Sending Product payload to Shopify for: ${title} (Ref: ${currentIdValue})`);

    try {
        const response = await axios.post(SHOPIFY_ENDPOINT, shopifyPayload, {
            headers: {
                "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
                "Content-Type": "application/json",
                "User-Agent": "ShopifyMiddleware/1.0.0"
            },
            timeout: 30000
        });

        const shopifyProductId = response.data.product.id;

        // METAFIELD CREATION LOGIC
        const metafields = [
            {
                namespace: "custom",
                key: "laser_type",
                value: `<p>${String(product.laserType || "N/A")}</p>`,
                type: "single_line_text_field"
            },
            {
                namespace: "custom",
                key: "build_volume",
                value: `<p>${buildVolumeText}</p>`,
                type: "single_line_text_field"
            },
            {
                namespace: "custom",
                key: "product_id_eos",
                value: `<p>${currentIdValue}</p>`,
                type: "single_line_text_field"
            },
            {
                namespace: "custom",
                key: "power_consumption",
                value: `<p>${product.powerConsumptionMax || product.powerConsumptionTypical ? `max ${product.powerConsumptionMax || "N/A"} kw / average ${product.powerConsumptionTypical || "N/A"} kw` : "N/A"}</p>`,
                type: "single_line_text_field"
            },
            {
                namespace: "custom",
                key: "scan_speed",
                value: `<p>${String(product.scanSpeed || "N/A")}</p>`,
                type: "single_line_text_field"
            },
            {
                namespace: "custom",
                key: "compressed_air_supply",
                value: `<p>${String(product.pressureValueBar || "N/A")}</p>`,
                type: "single_line_text_field"
            },
            {
                namespace: "custom",
                key: "highlight_text",
                value: `${String(product.shortDescription || "N/A")}`,
                type: "multi_line_text_field"
            },
            {
                namespace: "custom",
                key: "precision_optics",
                value: `${String(product.lightEngineCount || "N/A")}`,
                type: "single_line_text_field"
            },
            {
                namespace: "custom",
                key: "f_theta_lense",
                value: `${String(product.fThetaLenseCount || "N/A")}`,
                type: "single_line_text_field"
            },
            {
                namespace: "custom",
                key: "image",
                value: `${String(product?.image_sds?.image?.filepath || "N/A")}`,
                type: "file_reference"
            },
        ];

        console.log(`   🛠️  Attaching ${metafields.length} metafields to Product ID: ${shopifyProductId}...`);

        for (const meta of metafields) {
            try {
                await axios.post(
                    `https://${shopifyStore}.myshopify.com/admin/api/2024-01/products/${shopifyProductId}/metafields.json`,
                    { metafield: meta },
                    {
                        headers: {
                            "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
                            "Content-Type": "application/json",
                            "User-Agent": "ShopifyMiddleware/1.0.0"
                        }
                    }
                );
                console.log(`✅ Metafield attached: ${meta.key}=${meta.value}`);
            } catch (metaError) {
                console.error(`❌ Failed to attach metafield ${meta.key}:`, metaError.response?.data || metaError.message);
            }
        }

        return response;
    } catch (error) {
        if (error.response) {
            console.error(`❌ Shopify Error (${error.response.status}):`, JSON.stringify(error.response.data, null, 2));
        }
        throw error;
    }
}

async function checkProductExistsBySku(sku) {
    try {
        const graphqlEndpoint = `https://${shopifyStore}.myshopify.com/admin/api/2024-01/graphql.json`;
        const query = `
        {
          productVariants(first: 1, query: "sku:${sku}") {
            edges {
              node {
                id
                product {
                  id
                  title
                }
              }
            }
          }
        }
        `;

        const response = await axios.post(
            graphqlEndpoint,
            { query },
            {
                headers: {
                    "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
                    "Content-Type": "application/json",
                    "User-Agent": "ShopifyMiddleware/1.0.0"
                }
            }
        );

        const variants = response.data?.data?.productVariants?.edges || [];
        if (variants.length > 0) {
            return variants[0].node.product;
        }
        return null;
    } catch (error) {
        console.error(`❌ Error checking product existence for SKU ${sku}:`, error.response?.data || error.message);
        return null;
    }
}

async function syncProducts() {
    try {
        console.log("🚀 Starting Product Sync...");

        const products = await fetchFromGraphQL();
        console.log(`📦 Found ${products.length} products total in EOS.`);

        for (const product of products) {
            const currentProductNumber = String(product.productNumber || product.id);
            console.log(`🔎 Directly checking Shopify for Product Number (SKU): "${currentProductNumber}"...`);

            const existingProduct = await checkProductExistsBySku(currentProductNumber);

            if (existingProduct) {
                console.log(`⏭️  Skipping: ${product.name} (SKU: ${currentProductNumber}) already exists in Shopify.`);
                continue;
            }

            try {
                const response = await pushToShopify(product);
                const shopifyProductId = response.data.product.id;
                console.log(`✅ Product Sync Complete: ${product.name} (ID: ${shopifyProductId})`);
            } catch (error) {
                console.error(`⚠️ Failed to push product ${product.name}:`, error.message);
            }
        }

        console.log("🎉 Sync process completed.");

    } catch (error) {
        console.error("❌ Sync Failed:", error.message);
    }
}

syncProducts();
