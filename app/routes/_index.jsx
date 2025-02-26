import {Await, useLoaderData, Link} from '@remix-run/react';
import {Suspense, useState} from 'react';
import {Image, Money} from '@shopify/hydrogen';

/**
 * @type {MetaFunction}
 */
export const meta = () => {
  return [{title: 'Hydrogen | Home'}];
};

/**
 * @param {LoaderFunctionArgs} args
 */
export async function loader(args) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  return {...deferredData, ...criticalData};
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 * @param {LoaderFunctionArgs}
 */
async function loadCriticalData({context}) {
  // Fetch featured collection data in parallel with any other critical queries
  const [{collections}] = await Promise.all([
    context.storefront.query(FEATURED_COLLECTION_QUERY),
    // Add other critical queries here for parallel loading
  ]);

  return {
    featuredCollection: collections.nodes[0],
  };
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * @param {LoaderFunctionArgs}
 */
function loadDeferredData({context}) {
  // Fetch recommended products without blocking initial page load
  const recommendedProducts = context.storefront
    .query(RECOMMENDED_PRODUCTS_QUERY)
    .catch(() => null); // Silently handle errors for non-critical data

  return {
    recommendedProducts,
  };
}

export default function Homepage() {
  /** @type {LoaderReturnData} */
  const data = useLoaderData();
  return (
    <div className="home">
      <RecommendedProducts products={data.recommendedProducts} />
    </div>
  );
}

/**
 * Displays a featured collection with image and title
 * @param {{collection: FeaturedCollectionFragment}}
 */
function FeaturedCollection({collection}) {
  if (!collection) return null;
  const image = collection?.image;
  
  return (
    <Link
      className="featured-collection"
      to={`/collections/${collection.handle}`}
    >
      {image && (
        <div className="featured-collection-image">
          <Image data={image} sizes="100vw" />
        </div>
      )}
      <h1>{collection.title}</h1>
    </Link>
  );
}

/**
 * Displays a grid of recommended products with color variants and pricing
 * @param {{products: Promise<RecommendedProductsQuery | null>}}
 */
function RecommendedProducts({products}) {
  return (
    <div className="recommended-products">
      <Suspense fallback={<div>Loading...</div>}>
        <Await resolve={products}>
          {(response) => (
            <div className="recommended-products-grid">
              {response?.products.nodes.map((product) => {
                // State for tracking hovered color variant
                const [hoveredColor, setHoveredColor] = useState(null);

                // Check if product is on sale by comparing prices
                const isOnSale =
                  Number(product.compareAtPriceRange.minVariantPrice.amount) >
                  Number(product.priceRange.minVariantPrice.amount);

                // Extract color variants and their associated images
                const colorVariants = product.variants.nodes
                  .map((variant) => {
                    const colorOption = variant.selectedOptions.find(
                      (opt) => opt.name === 'Color',
                    );
                    return colorOption
                      ? {
                          color: colorOption.value,
                          image: variant.image,
                        }
                      : null;
                  })
                  .filter(Boolean);

                // Select image to display based on hover state
                const currentImage = hoveredColor
                  ? colorVariants.find((v) => v.color === hoveredColor)?.image
                  : product.images.nodes[1];

                return (
                  <Link
                    key={product.id}
                    className="recommended-product"
                    to={`/products/${product.handle}${
                      hoveredColor ? `?Color=${hoveredColor}` : ''
                    }`}
                  >
                    <div className="product-card">
                      {/* Sale badge indicator */}
                      {isOnSale && <span className="sale-badge">On Sale!</span>}
                      
                      {/* Product image */}
                      <div className="image-container">
                        <Image
                          className="product-image"
                          data={currentImage}
                          aspectRatio="1/1"
                          sizes="(min-width: 45em) 20vw, 50vw"
                        />
                      </div>

                      {/* Color variant selector dots */}
                      <div className="color-options">
                        {colorVariants.map(({color}, index) => (
                          <div
                            key={index}
                            className={`color-dot ${
                              hoveredColor === color ? 'active' : ''
                            }`}
                            style={{backgroundColor: color}}
                            title={color}
                            onMouseEnter={() => setHoveredColor(color)}
                            onMouseLeave={() => setHoveredColor(color)}
                          />
                        ))}
                      </div>

                      {/* Product details and pricing */}
                      <div className="product-info">
                        <p className="vendor">{product.vendor}</p>
                        <h4>{product.title}</h4>
                        <div className="pricing">
                          {isOnSale && (
                            <span className="compare-at">
                              <Money
                                data={
                                  product.compareAtPriceRange.minVariantPrice
                                }
                              />
                            </span>
                          )}
                          <span className="price">
                            <Money data={product.priceRange.minVariantPrice} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Await>
      </Suspense>
    </div>
  );
}

const FEATURED_COLLECTION_QUERY = `#graphql
  fragment FeaturedCollection on Collection {
    id
    title
    image {
      id
      url
      altText
      width
      height
    }
    handle
  }
  query FeaturedCollection($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 1, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        ...FeaturedCollection
      }
    }
  }
`;

const RECOMMENDED_PRODUCTS_QUERY = `#graphql
  fragment RecommendedProduct on Product {
    id
    title
    handle
    vendor
    priceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    compareAtPriceRange {
      minVariantPrice {
        amount
        currencyCode
      }
    }
    images(first: 12) {
      nodes {
        id
        url
        altText
        width
        height
      }
    }
    variants(first: 12) {
      nodes {
        id
        image {
          id
          url
          altText
          width
          height
        }
        availableForSale
        selectedOptions {
          name
          value
        }
      }
    }
  }
  query RecommendedProducts ($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 4, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        ...RecommendedProduct
      }
    }
  }
`;

/** @typedef {import('@shopify/remix-oxygen').LoaderFunctionArgs} LoaderFunctionArgs */
/** @template T @typedef {import('@remix-run/react').MetaFunction<T>} MetaFunction */
/** @typedef {import('storefrontapi.generated').FeaturedCollectionFragment} FeaturedCollectionFragment */
/** @typedef {import('storefrontapi.generated').RecommendedProductsQuery} RecommendedProductsQuery */
/** @typedef {import('@shopify/remix-oxygen').SerializeFrom<typeof loader>} LoaderReturnData */
