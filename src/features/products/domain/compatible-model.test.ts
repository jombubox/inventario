import { expect, it } from "vitest";
import { modelFromQuery } from "./compatible-model";

it.each(["Hisense 75H78G", " HISENSE   75H78G ", "75H78G"])("separates the selected brand from %s", query => {
  expect(modelFromQuery(query, "Hisense")).toBe("75H78G");
});
