/*
4. Your Task: Implement Risk Scoring
Create a patient risk scoring system. The total risk is the sum of scores from each category.

Blood Pressure Risk
Note: If systolic and diastolic readings fall into different risk categories, use the higher risk stage for scoring.

Normal (Systolic <120 AND Diastolic <80): 1 points
Elevated (Systolic 120‑129 AND Diastolic <80): 2 points
Stage 1 (Systolic 130‑139 OR Diastolic 80‑89): 3 points
Stage 2 (Systolic ≥140 OR Diastolic ≥90): 4 points

Invalid/Missing Data (0 points):
• Missing systolic or diastolic values (e.g., "150/" or "/90")
• Non-numeric values (e.g., "INVALID", "N/A")
• Null, undefined, or empty values

Temperature Risk
Normal (≤99.5°F): 0 points
Low Fever (99.6-100.9°F): 1 point
High Fever (≥100.1°F): 2 points
Invalid/Missing Data (0 points):
• Non-numeric values (e.g., "TEMP_ERROR", "invalid")
• Null, undefined, or empty values
Age Risk
Under 40 (<40 years): 1 points
40-65 (40-65 years, inclusive): 1 point
Over 65 (>65 years): 2 points

Invalid/Missing Data (0 points):
• Null, undefined, or empty values
• Non-numeric strings (e.g., "fifty-three", "unknown")

Total Risk Score = (BP Score) + (Temp Score) + (Age Score)

Required Outputs
Your solution should be able to produce these outputs based on your data analysis.
Alert Lists: Your system should identify patients who meet specific criteria:
High-Risk Patients: Patient IDs with total risk score ≥ 4
Fever Patients: Patient IDs with temperature ≥ 99.6°F
Data Quality Issues: Patient IDs with invalid/missing data (e.g., BP, Age, or Temp is missing/malformed)



*/


const API_URL = "https://assessment.ksensetech.com/api/patients";
const API_KEY = "ak_e66fae2bdc1f709d4eced000f0de19a1afa6181b3ea73003";
const LIMIT = 20;

async function getAllPatients() {
  let allPatients = [];
  let page = 1;
  let keepGoing = true;

  while (keepGoing) {
    const url = `${API_URL}?page=${page}&limit=${LIMIT}`;
    const options = {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
    };

    let data;
    try {
      data = await fetchWithRetry(url, options);
    } catch (err) {
      console.error(`Failed to fetch page ${page}:`, err);
      break;
    }

    // console.log(data);

    let patients = [];
    // check if the data is in expected format matching the api response
    if (data && Array.isArray(data.data)) {
      patients = data.data;
    } else if (data && Array.isArray(data.patients)) {
      patients = data.patients;
    } else if (data && Array.isArray(data.results)) {
      patients = data.results;
    } else {
      console.warn("Unknown data format:", data);
    }

    allPatients = allPatients.concat(patients);

    if (patients.length < LIMIT) {
      keepGoing = false;
    } else {
      page++;
    }
  }

  return allPatients;
}

async function fetchWithRetry(url, options, retries = 3, backoff = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status === 500 || res.status === 503) {
        throw new Error(`Temporary error: ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, backoff * (i + 1)));
    }
  }
}

function parseBloodPressure(bp) {
  if (!bp || typeof bp !== "string") return { systolic: null, diastolic: null };
  const match = bp.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return { systolic: null, diastolic: null };
  return { systolic: Number(match[1]), diastolic: Number(match[2]) };
}

function getBpStage(s, d) {
  // Returns the risk stage (1-4) for each value
  let sysStage = 0,
    diaStage = 0;
  if (isNaN(s) || isNaN(d)) return 0;

  // systolic
  if (s < 120) sysStage = 1;
  else if (s >= 120 && s <= 129) sysStage = 2;
  else if (s >= 130 && s <= 139) sysStage = 3;
  else if (s >= 140) sysStage = 4;

  // distolic
  if (d < 80) diaStage = 1;
  else if (d >= 80 && d <= 89) diaStage = 3;
  else if (d >= 90) diaStage = 4;

  return Math.max(sysStage, diaStage);
}

function scoreBloodPressure(bp) {
  if (!bp || typeof bp !== "string") return { score: 0, invalid: true };
  const parts = bp.split("/");
  if (parts.length !== 2) return { score: 0, invalid: true };
  const systolic = Number(parts[0].trim());
  const diastolic = Number(parts[1].trim());
  if (isNaN(systolic) || isNaN(diastolic)) return { score: 0, invalid: true };

  const stage = getBpStage(systolic, diastolic);
  if (stage === 0) return { score: 0, invalid: true };
  return { score: stage, invalid: false };
}

function scoreTemperature(temp) {
  const t = Number(temp);
  if (isNaN(t)) return { score: 0, invalid: true };
  if (t <= 99.5) return { score: 0, invalid: false };
  if (t >= 99.6 && t <= 100.9) return { score: 1, invalid: false };
  if (t >= 101.0) return { score: 2, invalid: false };
  return { score: 0, invalid: true };
}

function scoreAge(age) {
  const a = Number(age);
  if (isNaN(a)) return { score: 0, invalid: true };
  if (a < 40) return { score: 1, invalid: false };
  if (a >= 40 && a <= 65) return { score: 1, invalid: false };
  if (a > 65) return { score: 2, invalid: false };
  return { score: 0, invalid: true };
}

getAllPatients().then(async (patients) => {
  console.log("all patient count:", patients.length);

  let final_results = {};

  const highRisk = [];
  const feverPatients = [];
  const dataQualityIssues = [];

  for (const p of patients) {
    const bpResult = scoreBloodPressure(p.blood_pressure);
    const tempResult = scoreTemperature(p.temperature);
    const ageResult = scoreAge(p.age);

    const totalRisk = bpResult.score + tempResult.score + ageResult.score;

    // Only include as high risk if ALL data is valid
    if (
      totalRisk >= 4 &&
      !bpResult.invalid &&
      !tempResult.invalid &&
      !ageResult.invalid
    ) {
      // highRisk.push(p.patient_id);
      highRisk.push(p);
    }

    const t = Number(p.temperature);
    if (!isNaN(t) && t >= 99.6) feverPatients.push(p.patient_id);

    if (bpResult.invalid || tempResult.invalid || ageResult.invalid) {
      dataQualityIssues.push(p.patient_id);
    }
  }

  final_results.high_risk_patients = highRisk;
  final_results.fever_patients = feverPatients;
  final_results.data_quality_issues = dataQualityIssues;
  console.log(patients);
  console.log("Final Results:", final_results);

  // await submitAlert(final_results);
});

const submitAlert = async (final_results) => {
  const url = "https://assessment.ksensetech.com/api/submit-assessment";
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(final_results),
  };

  const response = await (await fetch(url, options)).json();
  console.log(JSON.stringify(response));
};
