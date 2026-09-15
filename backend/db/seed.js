const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database');

async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DATABASE_RESET !== 'true') {
    throw new Error('Database reset is blocked. Set ALLOW_DATABASE_RESET=true only for an isolated development or test database.');
  }
  if (!process.env.INITIAL_ADMIN_PASSWORD) {
    throw new Error('INITIAL_ADMIN_PASSWORD is required when creating the local development administrator.');
  }
  console.log('[Seed] Starting database initialization...');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const ddl = fs.readFileSync(schemaPath, 'utf8');

  // 1. Run Schema DDL
  console.log('[Seed] Applying schema.sql...');
  await db.query(ddl);
  console.log('[Seed] Schema applied successfully.');

  // 2. Insert Reference Districts
  console.log('[Seed] Inserting official master districts...');
  const referenceDistricts = [
    // Bihar
    { district: 'Purnea', state: 'Bihar' },
    { district: 'Patna', state: 'Bihar' },
    { district: 'Gaya', state: 'Bihar' },
    { district: 'Bhagalpur', state: 'Bihar' },
    { district: 'Muzaffarpur', state: 'Bihar' },
    // Maharashtra
    { district: 'Mumbai', state: 'Maharashtra' },
    { district: 'Pune', state: 'Maharashtra' },
    { district: 'Nagpur', state: 'Maharashtra' },
    { district: 'Nashik', state: 'Maharashtra' },
    { district: 'Thane', state: 'Maharashtra' },
    // Delhi
    { district: 'Central Delhi', state: 'Delhi' },
    { district: 'New Delhi', state: 'Delhi' },
    { district: 'South Delhi', state: 'Delhi' },
    { district: 'North Delhi', state: 'Delhi' },
    // Karnataka
    { district: 'Bengaluru Urban', state: 'Karnataka' },
    { district: 'Bengaluru Rural', state: 'Karnataka' },
    { district: 'Mysuru', state: 'Karnataka' },
    // Tamil Nadu
    { district: 'Chennai', state: 'Tamil Nadu' },
    { district: 'Coimbatore', state: 'Tamil Nadu' },
    { district: 'Madurai', state: 'Tamil Nadu' },
    // Telangana
    { district: 'Hyderabad', state: 'Telangana' },
    { district: 'Warangal', state: 'Telangana' },
    // Gujarat
    { district: 'Ahmedabad', state: 'Gujarat' },
    { district: 'Surat', state: 'Gujarat' },
    { district: 'Vadodara', state: 'Gujarat' },
    // Uttar Pradesh
    { district: 'Lucknow', state: 'Uttar Pradesh' },
    { district: 'Kanpur Nagar', state: 'Uttar Pradesh' },
    { district: 'Varanasi', state: 'Uttar Pradesh' },
    { district: 'Noida', state: 'Uttar Pradesh' },
    // West Bengal
    { district: 'Kolkata', state: 'West Bengal' },
    { district: 'Howrah', state: 'West Bengal' }
  ];

  for (const item of referenceDistricts) {
    await db.query(
      `INSERT INTO districts (district_name, state_name, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (district_name, state_name) DO NOTHING`,
      [item.district, item.state]
    );
  }
  console.log(`[Seed] Seeded ${referenceDistricts.length} master districts.`);

  // 3. Create ONE clearly documented Admin Account
  console.log('[Seed] Setting up default Administrator account...');
  const adminEmail = 'admin@metrology.gov.in';
  const adminPass = process.env.INITIAL_ADMIN_PASSWORD;
  const passHash = await bcrypt.hash(adminPass, 10);

  const adminInsert = await db.query(
    `INSERT INTO users (full_name, business_name, email, phone, password_hash, role, district, state, address, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, full_name, email, role`,
    [
      'Central Metrology Administrator',
      'Legal Metrology Department',
      adminEmail,
      '9876543210',
      passHash,
      'admin',
      'New Delhi',
      'Delhi',
      'Directorate of Legal Metrology, Krishi Bhawan, New Delhi'
    ]
  );

  console.log('----------------------------------------------------');
  console.log('Database initialization complete!');
  console.log('Default Admin Account Credentials:');
  console.log(`  Email:    ${adminEmail}`);
  console.log(`  Password: ${adminPass}`);
  console.log(`  Role:     admin`);
  console.log('----------------------------------------------------');

  process.exit(0);
}

seed().catch(err => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});
