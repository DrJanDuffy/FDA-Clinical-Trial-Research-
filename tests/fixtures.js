// Realistic-shaped payloads matching each API's documented response.
module.exports = {
  ctg: {
    totalCount: 1487,
    nextPageToken: "NF0g5J2K",
    studies: [{
      protocolSection: {
        identificationModule: { nctId: "NCT05012345", briefTitle: "Pembrolizumab Plus Chemotherapy in Advanced Pancreatic Adenocarcinoma", organization: { fullName: "Dana-Farber" } },
        statusModule: {
          overallStatus: "RECRUITING",
          startDateStruct: { date: "2024-03-15" },
          lastUpdatePostDateStruct: { date: "2026-07-30" },
          studyFirstPostDateStruct: { date: "2024-02-01" }
        },
        descriptionModule: { briefSummary: "This phase 2 study evaluates whether adding pembrolizumab to standard gemcitabine and nab-paclitaxel improves progression-free survival in participants with previously untreated metastatic pancreatic adenocarcinoma. Participants will be followed for up to five years for survival and safety outcomes, with tumour tissue collected at baseline and at progression for correlative biomarker analysis." },
        conditionsModule: { conditions: ["Pancreatic Adenocarcinoma", "Metastatic Cancer"] },
        designModule: { studyType: "INTERVENTIONAL", phases: ["PHASE2"], enrollmentInfo: { count: 220 } },
        armsInterventionsModule: { interventions: [{ type: "DRUG", name: "Pembrolizumab" }, { type: "DRUG", name: "Gemcitabine" }] },
        sponsorCollaboratorsModule: { leadSponsor: { name: "Dana-Farber Cancer Institute" } },
        contactsLocationsModule: { locations: [
          { facility: "DFCI", city: "Boston", state: "MA", country: "United States" },
          { facility: "MSK", city: "New York", state: "NY", country: "United States" },
          { facility: "Charite", city: "Berlin", country: "Germany" }
        ] }
      }
    }, {
      protocolSection: {
        identificationModule: { nctId: "NCT04998877", briefTitle: "Observational Registry of Long-Term Outcomes After CAR-T Therapy" },
        statusModule: { overallStatus: "TERMINATED", lastUpdatePostDateStruct: { date: "2025-11-02" } },
        descriptionModule: { briefSummary: "A registry study." },
        conditionsModule: { conditions: ["Lymphoma"] },
        designModule: { studyType: "OBSERVATIONAL", phases: ["NA"], enrollmentInfo: { count: 40 } },
        sponsorCollaboratorsModule: { leadSponsor: { name: "Global Registry Consortium" } },
        contactsLocationsModule: { locations: [] }
      }
    }]
  },
  epmc: {
    hitCount: 9241,
    nextCursorMark: "AoJwhY",
    resultList: { result: [{
      id: "39887766", source: "MED", pmid: "39887766", doi: "10.1056/NEJMoa2401234",
      title: "Randomized Trial of Semaglutide in Heart Failure With Preserved Ejection Fraction",
      authorString: "Kosiborod MN, Abildstrom SZ, Borlaug BA, et al.",
      journalInfo: { journal: { title: "The New England Journal of Medicine" }, yearOfPublication: 2026 },
      pubYear: "2026", firstPublicationDate: "2026-05-14",
      abstractText: "BACKGROUND: Obesity-related heart failure with preserved ejection fraction is associated with substantial symptom burden. METHODS: We randomly assigned 529 patients to once-weekly semaglutide or placebo for 52 weeks. RESULTS: The mean change in the KCCQ clinical summary score was 16.6 points with semaglutide and 8.7 points with placebo. CONCLUSIONS: Semaglutide led to larger reductions in symptoms and physical limitations than placebo.",
      isOpenAccess: "N", citedByCount: 412,
      pubTypeList: { pubType: ["Randomized Controlled Trial", "Journal Article"] }
    }, {
      id: "PPR812345", source: "PPR", doi: "10.1101/2026.06.01.123456",
      title: "A Deep Learning Model for Early Detection of Sepsis From Bedside Vitals",
      authorString: "Alvarez R, Nakamura T.",
      pubYear: "2026", firstPublicationDate: "2026-06-02",
      abstractText: "We present a transformer model trained on 1.2M ICU stays.",
      isOpenAccess: "Y", citedByCount: 3,
      pubTypeList: { pubType: ["Preprint"] }
    }] }
  },
  drugsfda: {
    meta: { results: { total: 318, skip: 0, limit: 25 } },
    results: [{
      application_number: "BLA761234", sponsor_name: "Acme Biologics Inc",
      openfda: { brand_name: ["ZYNTARA"], generic_name: ["tarlizumab"], route: ["INTRAVENOUS"] },
      products: [{ brand_name: "ZYNTARA", dosage_form: "INJECTION, SOLUTION", marketing_status: "Prescription", active_ingredients: [{ name: "TARLIZUMAB", strength: "100MG/ML" }] }],
      submissions: [
        { submission_type: "ORIG", submission_number: "1", submission_status: "AP", submission_status_date: "20260612", review_priority: "PRIORITY", submission_class_code_description: "Type 1 - New Molecular Entity" },
        { submission_type: "SUPPL", submission_number: "3", submission_status: "TA", submission_status_date: "20260701" }
      ]
    }, {
      application_number: "ANDA209876", sponsor_name: "Generic Pharma Ltd",
      openfda: { brand_name: [], generic_name: ["metformin hydrochloride"], route: ["ORAL"] },
      products: [{ brand_name: "METFORMIN HYDROCHLORIDE", dosage_form: "TABLET, EXTENDED RELEASE", marketing_status: "Prescription", active_ingredients: [{ name: "METFORMIN HYDROCHLORIDE" }] }],
      submissions: [{ submission_type: "ORIG", submission_number: "1", submission_status: "AP", submission_status_date: "20260408" }]
    }]
  },
  enforcement: {
    meta: { results: { total: 76, skip: 0, limit: 25 } },
    results: [{
      recall_number: "D-1234-2026", classification: "Class I", status: "Ongoing",
      recalling_firm: "Northbridge Sterile Products LLC",
      product_description: "Heparin Sodium Injection, USP, 5,000 USP units per mL, 10 mL single-dose vial, Rx only",
      reason_for_recall: "Product may contain particulate matter identified as glass fragments, which could result in local irritation, thrombosis or embolic events if administered intravenously.",
      report_date: "20260805", recall_initiation_date: "20260722",
      product_quantity: "24,300 vials", distribution_pattern: "Nationwide and Puerto Rico",
      voluntary_mandated: "Voluntary: Firm initiated"
    }]
  }
};
