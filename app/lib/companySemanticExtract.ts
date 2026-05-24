/**
 * Re-export shim — semantic company/industry helpers live in customerIndustry.ts.
 */
export {
  classifyBusinessDescriptor,
  demoteInferredCompanyToIndustry,
  extractIndustryPhrasesFromText,
  extractIndustrySuffixFromCompany,
  isExplicitCompanyName,
  isGenericIndustryOnly,
  isIndustryDescriptor,
  isLikelySocialAccountName,
  isNamedBrandOrClinic,
  normalizeIndustryValue,
  pickSemanticCompanyName,
  pickSemanticIndustry,
  resolveCompanyAndIndustryFromDescriptor,
  type BusinessDescriptorKind,
} from "./customerIndustry";
