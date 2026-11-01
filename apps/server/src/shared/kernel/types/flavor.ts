/** Tags a type so two different flavors never mix, while plain values stay assignable. */
export type Flavor<T, F extends string> = T & { readonly __flavor?: F };
