export interface ProductsInput {
  /** Maximum number of products to return */
  limit?: number;
  /** Category filter */
  category?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  image: string;
}

/** Fetches product data from an API */
export default async function products(
  input: ProductsInput,
): Promise<Product[]> {
  // Return mock data for the starter template
  const allProducts: Product[] = [
    {
      id: "1",
      name: "Classic T-Shirt",
      price: 29.99,
      image: "/images/tshirt.jpg",
    },
    {
      id: "2",
      name: "Denim Jacket",
      price: 89.99,
      image: "/images/jacket.jpg",
    },
    {
      id: "3",
      name: "Canvas Sneakers",
      price: 59.99,
      image: "/images/sneakers.jpg",
    },
  ];

  const filtered = input.category
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(input.category!.toLowerCase()),
      )
    : allProducts;

  return filtered.slice(0, input.limit ?? 10);
}
