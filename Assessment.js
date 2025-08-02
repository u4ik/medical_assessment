const API_URL = "https://assessment.ksensetech.com/api/patients";
const API_KEY = "ak_e66fae2bdc1f709d4eced000f0de19a1afa6181b3ea73003";
const PAGE_SIZE = 20;

async function getAllPatients() {
  let allPatients = [];
  let page = 1;
  let keepGoing = true;

  while (keepGoing) {
    const url = `${API_URL}?page=${page}&limit=${PAGE_SIZE}`;
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

    if (patients.length < PAGE_SIZE) {
      // if (!data.pagination.hasNextPage) {
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

function scoreBloodPressure(bp) {
  if (!bp || typeof bp !== "string") return { score: 0, invalid: true };
  const match = bp.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return { score: 0, invalid: true };
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (isNaN(systolic) || isNaN(diastolic)) return { score: 0, invalid: true };

  if (systolic < 120 && diastolic < 80) return { score: 1, invalid: false };
  if (systolic >= 120 && systolic <= 129 && diastolic < 80)
    return { score: 2, invalid: false };
  if (
    (systolic >= 130 && systolic <= 139) ||
    (diastolic >= 80 && diastolic <= 89)
  )
    return { score: 3, invalid: false };
  if (systolic >= 140 || diastolic >= 90) return { score: 4, invalid: false };
  return { score: 0, invalid: true };
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

  let final_results = {}

  const highRisk = [];
  const feverPatients = [];
  const dataQualityIssues = [];

  for (const p of patients) {
    const bpResult = scoreBloodPressure(p.blood_pressure);
    const tempResult = scoreTemperature(p.temperature);
    const ageResult = scoreAge(p.age);

    const totalRisk = bpResult.score + tempResult.score + ageResult.score;

    // High risk
    if (totalRisk >= 4) highRisk.push(p.patient_id);

    // High fever
    const t = Number(p.temperature);
    if (!isNaN(t) && t >= 99.6) feverPatients.push(p.patient_id);

    // Patients data qualty issues
    if (bpResult.invalid || tempResult.invalid || ageResult.invalid) {
      dataQualityIssues.push(p.patient_id);
    }
  }


  final_results.high_risk_patients = highRisk;
  final_results.fever_patients = feverPatients;
  final_results.data_quality_issues = dataQualityIssues;

  console.log("Final Results:", final_results);

  await submitAlert(final_results);

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
  console.log(response);
};
