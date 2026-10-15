import { conversionCloud } from "@/lib/conversions";
import { ConversionCloud } from "./ConversionCloud";

export function Converter() {
  const { items, pairs, formats } = conversionCloud(150);
  return <ConversionCloud items={items} pairs={pairs} formats={formats} />;
}
