/** @format */

import { type SchemaTypeDefinition } from "sanity";

import { blockContentType } from "./blockContentType";
import { categoryType } from "./categoryType";

import { authorType } from "./authorType";
import { productType } from "./productType";
import { orderType } from "./orderType";
import { brandType } from "./brandTypes";
import { blogCategoryType } from "./blogCategoryType";
import { blogType } from "./blogType";
import { addressType } from "./addressType";
import { postType } from "./postType";


export const schema: { types: SchemaTypeDefinition[] } = {
  types: [
    categoryType,
    blockContentType,
    productType,
    orderType,
    brandType,
    blogCategoryType,
    blogType,
    authorType,
    addressType,
    postType,
    
  ],
};
