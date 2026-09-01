/**
 * Development seed for the ESCA Estate marketplace.
 *
 * Passwords are read from the environment (SEED_ADMIN_PASSWORD, SEED_AGENT_PASSWORD,
 * SEED_USER_PASSWORD) and are never hardcoded. The script refuses to run when
 * NODE_ENV is "production".
 *
 * Run with: npm run prisma:seed
 */
import {
  AppointmentStatus,
  MessageType,
  NotificationType,
  PricePeriod,
  Prisma,
  PrismaClient,
  PropertyPurpose,
  PropertyStatus,
  PropertyType,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in .env before seeding (see .env.example).`,
    );
  }

  if (value.length < 8) {
    throw new Error(`${name} must be at least 8 characters long`);
  }

  return value;
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Deterministic image placeholders so seeded listings render in a client. */
function imageUrl(seed: string, index: number): string {
  return `https://picsum.photos/seed/${seed}-${index}/1200/800`;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@esca-estate.com';
  const adminPassword = requireEnv('SEED_ADMIN_PASSWORD');
  const agentPassword = requireEnv('SEED_AGENT_PASSWORD');
  const userPassword = requireEnv('SEED_USER_PASSWORD');

  console.log('Clearing existing data...');

  // Order matters: children before parents, since not every FK cascades.
  await prisma.report.deleteMany();
  await prisma.review.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.propertyFeature.deleteMany();
  await prisma.propertyImage.deleteMany();
  await prisma.property.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.category.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();

  const [adminHash, agentHash, userHash] = await Promise.all([
    bcrypt.hash(adminPassword, SALT_ROUNDS),
    bcrypt.hash(agentPassword, SALT_ROUNDS),
    bcrypt.hash(userPassword, SALT_ROUNDS),
  ]);

  // -------------------------------------------------------------------------
  //  Locations
  // -------------------------------------------------------------------------
  console.log('Creating locations...');

  const locationSeeds = [
    { country: 'United States', city: 'New York', district: 'Brooklyn', latitude: 40.6782, longitude: -73.9442 },
    { country: 'United States', city: 'New York', district: 'Manhattan', latitude: 40.7831, longitude: -73.9712 },
    { country: 'United States', city: 'Miami', district: 'Brickell', latitude: 25.7617, longitude: -80.1918 },
    { country: 'United Arab Emirates', city: 'Dubai', district: 'Downtown', latitude: 25.1972, longitude: 55.2744 },
    { country: 'United Arab Emirates', city: 'Dubai', district: 'Marina', latitude: 25.0805, longitude: 55.1403 },
    { country: 'Spain', city: 'Barcelona', district: 'Eixample', latitude: 41.3912, longitude: 2.1646 },
    { country: 'Uzbekistan', city: 'Tashkent', district: 'Yunusabad', latitude: 41.3651, longitude: 69.2891 },
    { country: 'Uzbekistan', city: 'Tashkent', district: 'Mirzo Ulugbek', latitude: 41.3383, longitude: 69.3345 },
  ];

  const locations = await Promise.all(
    locationSeeds.map((location) =>
      prisma.location.create({
        data: {
          ...location,
          slug: slugify(`${location.country} ${location.city} ${location.district}`),
        },
      }),
    ),
  );

  const locationBySlug = new Map(locations.map((location) => [location.slug, location]));

  // -------------------------------------------------------------------------
  //  Categories
  // -------------------------------------------------------------------------
  console.log('Creating categories...');

  const categorySeeds = [
    { name: 'Residential', description: 'Homes and apartments for everyday living', icon: 'home', sortOrder: 1 },
    { name: 'Luxury', description: 'Premium properties with high-end finishes', icon: 'gem', sortOrder: 2 },
    { name: 'Commercial', description: 'Offices, shops and warehouses', icon: 'briefcase', sortOrder: 3 },
    { name: 'New Development', description: 'Newly built and off-plan properties', icon: 'hammer', sortOrder: 4 },
    { name: 'Vacation', description: 'Short-stay and holiday rentals', icon: 'palm-tree', sortOrder: 5 },
  ];

  const categories = await Promise.all(
    categorySeeds.map((category) =>
      prisma.category.create({ data: { ...category, slug: slugify(category.name) } }),
    ),
  );

  const categoryByName = new Map(categories.map((category) => [category.name, category]));

  // -------------------------------------------------------------------------
  //  Users
  // -------------------------------------------------------------------------
  console.log('Creating users...');

  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      password: adminHash,
      name: 'Amara Osei',
      phone: '+12125550100',
      role: UserRole.ADMIN,
      isEmailVerified: true,
    },
  });

  const agentSeeds = [
    {
      email: 'jordan.rivera@esca-estate.com',
      name: 'Jordan Rivera',
      phone: '+13475550123',
      company: 'Rivera & Co Realty',
      licenseNo: 'NY-RE-8842190',
      bio: 'Fifteen years placing families in Brooklyn brownstones and Manhattan walk-ups.',
      website: 'https://rivera-realty.example.com',
      officePhone: '+12125550188',
      locationSlug: 'united-states-new-york-brooklyn',
      isVerified: true,
    },
    {
      email: 'leila.haddad@esca-estate.com',
      name: 'Leila Haddad',
      phone: '+971505550144',
      company: 'Gulf Horizon Properties',
      licenseNo: 'AE-RE-5521884',
      bio: 'Specialising in waterfront apartments and off-plan investments across Dubai.',
      website: 'https://gulf-horizon.example.com',
      officePhone: '+97143335522',
      locationSlug: 'united-arab-emirates-dubai-marina',
      isVerified: true,
    },
    {
      email: 'tomas.serrano@esca-estate.com',
      name: 'Tomas Serrano',
      phone: '+34600555017',
      company: 'Serrano Urbana',
      licenseNo: 'ES-RE-3390147',
      bio: 'Modernist flats and renovation projects in central Barcelona.',
      locationSlug: 'spain-barcelona-eixample',
      isVerified: false,
    },
  ];

  type SeededAgent = {
    user: Awaited<ReturnType<typeof prisma.user.create>>;
    agent: NonNullable<Awaited<ReturnType<typeof prisma.agent.create>>>;
  };
  const agents: SeededAgent[] = [];

  for (const seed of agentSeeds) {
    const { locationSlug, email, name, phone, ...agentFields } = seed;

    const user = await prisma.user.create({
      data: {
        email,
        name,
        phone,
        password: agentHash,
        role: UserRole.AGENT,
        isEmailVerified: true,
        agent: {
          create: {
            ...agentFields,
            locationId: locationBySlug.get(locationSlug)?.id,
          },
        },
      },
      include: { agent: true },
    });

    agents.push({ user, agent: user.agent! });
  }

  const userSeeds = [
    { email: 'sofia.almeida@example.com', name: 'Sofia Almeida', phone: '+13475550201' },
    { email: 'daniel.okonkwo@example.com', name: 'Daniel Okonkwo', phone: '+13475550202' },
    { email: 'mei.tanaka@example.com', name: 'Mei Tanaka', phone: '+13475550203' },
    { email: 'oliver.brandt@example.com', name: 'Oliver Brandt', phone: '+13475550204' },
    { email: 'nilufar.karimova@example.com', name: 'Nilufar Karimova', phone: '+998901112233' },
    { email: 'grace.mwangi@example.com', name: 'Grace Mwangi', phone: '+13475550206' },
  ];

  const users = await Promise.all(
    userSeeds.map((seed) =>
      prisma.user.create({
        data: { ...seed, password: userHash, role: UserRole.USER, isEmailVerified: true },
      }),
    ),
  );

  // -------------------------------------------------------------------------
  //  Properties
  // -------------------------------------------------------------------------
  console.log('Creating properties...');

  interface PropertySeed {
    title: string;
    description: string;
    price: number;
    currency: string;
    pricePeriod: PricePeriod;
    purpose: PropertyPurpose;
    propertyType: PropertyType;
    status: PropertyStatus;
    bedrooms?: number;
    bathrooms?: number;
    area: number;
    yearBuilt?: number;
    floor?: number;
    totalFloors?: number;
    parkingSpaces: number;
    address: string;
    locationSlug: string;
    categoryName: string;
    agentIndex: number;
    isFeatured: boolean;
    features: { name: string; value?: string }[];
  }

  const propertySeeds: PropertySeed[] = [
    {
      title: 'Sunlit Two-Bedroom in Williamsburg',
      description:
        'A south-facing corner unit with original hardwood floors, a renovated kitchen and a private balcony overlooking a quiet tree-lined street. Two blocks from the Bedford Avenue subway.',
      price: 685000, currency: 'USD', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.APARTMENT,
      status: PropertyStatus.APPROVED,
      bedrooms: 2, bathrooms: 1, area: 89.5, yearBuilt: 1998, floor: 4, totalFloors: 6,
      parkingSpaces: 0, address: '112 Berry Street, Apt 4B',
      locationSlug: 'united-states-new-york-brooklyn', categoryName: 'Residential',
      agentIndex: 0, isFeatured: true,
      features: [
        { name: 'Heating', value: 'Central gas' },
        { name: 'Balcony', value: 'Yes' },
        { name: 'Elevator', value: 'Yes' },
        { name: 'Pets allowed', value: 'Cats only' },
      ],
    },
    {
      title: 'Restored Brownstone with Garden',
      description:
        'A four-storey brownstone restored to its 1890s detailing, with a landscaped rear garden, chef kitchen and separate garden-level rental unit. Move-in ready.',
      price: 2450000, currency: 'USD', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.HOUSE,
      status: PropertyStatus.APPROVED,
      bedrooms: 5, bathrooms: 3, area: 310, yearBuilt: 1892, totalFloors: 4,
      parkingSpaces: 1, address: '44 Clinton Avenue',
      locationSlug: 'united-states-new-york-brooklyn', categoryName: 'Luxury',
      agentIndex: 0, isFeatured: true,
      features: [
        { name: 'Garden', value: '60 sqm' },
        { name: 'Fireplace', value: '3 working' },
        { name: 'Basement', value: 'Finished' },
      ],
    },
    {
      title: 'Midtown Studio with Skyline Views',
      description:
        'An efficient studio on the 28th floor with floor-to-ceiling glass, building gym and 24-hour doorman. Ideal pied-a-terre or rental investment near Bryant Park.',
      price: 3400, currency: 'USD', pricePeriod: PricePeriod.MONTHLY,
      purpose: PropertyPurpose.RENT, propertyType: PropertyType.APARTMENT,
      status: PropertyStatus.APPROVED,
      bedrooms: 0, bathrooms: 1, area: 41, yearBuilt: 2015, floor: 28, totalFloors: 42,
      parkingSpaces: 0, address: '301 West 42nd Street, Apt 28F',
      locationSlug: 'united-states-new-york-manhattan', categoryName: 'Residential',
      agentIndex: 0, isFeatured: false,
      features: [
        { name: 'Doorman', value: '24 hour' },
        { name: 'Gym', value: 'On site' },
        { name: 'Air conditioning', value: 'Central' },
      ],
    },
    {
      title: 'Brickell Waterfront Penthouse',
      description:
        'A duplex penthouse with 270-degree bay views, private elevator entry, wraparound terrace and access to a resort-grade amenity deck.',
      price: 4900000, currency: 'USD', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.VILLA,
      status: PropertyStatus.APPROVED,
      bedrooms: 4, bathrooms: 5, area: 420, yearBuilt: 2021, floor: 55, totalFloors: 56,
      parkingSpaces: 3, address: '1000 Brickell Bay Drive, PH2',
      locationSlug: 'united-states-miami-brickell', categoryName: 'Luxury',
      agentIndex: 0, isFeatured: true,
      features: [
        { name: 'Private pool', value: 'Rooftop' },
        { name: 'Smart home', value: 'Full automation' },
        { name: 'Concierge', value: 'Dedicated' },
      ],
    },
    {
      title: 'Downtown Dubai Apartment Facing the Fountain',
      description:
        'A high-floor two-bedroom with uninterrupted views of the Dubai Fountain and Burj Khalifa, fully furnished by an award-winning studio.',
      price: 3200000, currency: 'AED', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.APARTMENT,
      status: PropertyStatus.APPROVED,
      bedrooms: 2, bathrooms: 3, area: 138, yearBuilt: 2019, floor: 36, totalFloors: 63,
      parkingSpaces: 2, address: 'Burj Vista Tower 1, Unit 3604',
      locationSlug: 'united-arab-emirates-dubai-downtown', categoryName: 'Luxury',
      agentIndex: 1, isFeatured: true,
      features: [
        { name: 'Furnished', value: 'Fully' },
        { name: 'View', value: 'Burj Khalifa and Fountain' },
        { name: 'Pool', value: 'Shared infinity' },
      ],
    },
    {
      title: 'Marina Loft with Berth Access',
      description:
        'A double-height loft on the marina promenade with direct berth access, private parking and a generous entertaining terrace.',
      price: 185000, currency: 'AED', pricePeriod: PricePeriod.YEARLY,
      purpose: PropertyPurpose.RENT, propertyType: PropertyType.APARTMENT,
      status: PropertyStatus.APPROVED,
      bedrooms: 3, bathrooms: 3, area: 196, yearBuilt: 2017, floor: 12, totalFloors: 30,
      parkingSpaces: 2, address: 'Marina Gate 2, Unit 1204',
      locationSlug: 'united-arab-emirates-dubai-marina', categoryName: 'Vacation',
      agentIndex: 1, isFeatured: false,
      features: [
        { name: 'Berth access', value: 'Included' },
        { name: 'Terrace', value: '38 sqm' },
        { name: 'Maid room', value: 'Yes' },
      ],
    },
    {
      title: 'Grade-A Office Floor in Dubai Marina',
      description:
        'A full fitted floor with 84 workstations, four meeting rooms and dedicated server room. Available for immediate occupation.',
      price: 950000, currency: 'AED', pricePeriod: PricePeriod.YEARLY,
      purpose: PropertyPurpose.RENT, propertyType: PropertyType.OFFICE,
      status: PropertyStatus.APPROVED,
      bathrooms: 4, area: 640, yearBuilt: 2016, floor: 18, totalFloors: 34,
      parkingSpaces: 12, address: 'Marina Plaza, Level 18',
      locationSlug: 'united-arab-emirates-dubai-marina', categoryName: 'Commercial',
      agentIndex: 1, isFeatured: false,
      features: [
        { name: 'Fitted', value: 'Turnkey' },
        { name: 'Meeting rooms', value: '4' },
        { name: 'Raised floor', value: 'Yes' },
      ],
    },
    {
      title: 'Modernist Flat in the Eixample',
      description:
        'An original 1920s flat with hydraulic tile floors, galleried windows and a quiet interior courtyard aspect, two streets from Passeig de Gracia.',
      price: 795000, currency: 'EUR', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.APARTMENT,
      status: PropertyStatus.APPROVED,
      bedrooms: 3, bathrooms: 2, area: 142, yearBuilt: 1924, floor: 2, totalFloors: 7,
      parkingSpaces: 0, address: "Carrer d'Arago 218, 2-1",
      locationSlug: 'spain-barcelona-eixample', categoryName: 'Residential',
      agentIndex: 2, isFeatured: true,
      features: [
        { name: 'Original tiles', value: 'Hydraulic' },
        { name: 'Ceiling height', value: '3.6 m' },
        { name: 'Lift', value: 'Yes' },
      ],
    },
    {
      title: 'Renovation Project Near Sagrada Familia',
      description:
        'A blank-canvas apartment requiring full renovation, sold with approved plans for a three-bedroom layout. Strong rental yield potential.',
      price: 410000, currency: 'EUR', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.APARTMENT,
      status: PropertyStatus.APPROVED,
      bedrooms: 2, bathrooms: 1, area: 98, yearBuilt: 1961, floor: 5, totalFloors: 8,
      parkingSpaces: 0, address: 'Carrer de Provenca 455, 5-2',
      locationSlug: 'spain-barcelona-eixample', categoryName: 'New Development',
      agentIndex: 2, isFeatured: false,
      features: [
        { name: 'Condition', value: 'Requires renovation' },
        { name: 'Approved plans', value: 'Included' },
      ],
    },
    {
      title: 'Family Townhouse in Yunusabad',
      description:
        'A three-level townhouse in a gated community with a private courtyard, covered parking and a dedicated guest floor.',
      price: 285000, currency: 'USD', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.TOWNHOUSE,
      status: PropertyStatus.APPROVED,
      bedrooms: 4, bathrooms: 3, area: 245, yearBuilt: 2020, totalFloors: 3,
      parkingSpaces: 2, address: 'Amir Temur Street 91, Block C',
      locationSlug: 'uzbekistan-tashkent-yunusabad', categoryName: 'Residential',
      agentIndex: 0, isFeatured: false,
      features: [
        { name: 'Gated community', value: 'Yes' },
        { name: 'Courtyard', value: '80 sqm' },
        { name: 'Security', value: '24 hour' },
      ],
    },
    {
      title: 'Retail Unit on Mirzo Ulugbek Avenue',
      description:
        'A corner retail unit with 14 metres of street frontage, currently fitted as a cafe. High footfall throughout the day.',
      price: 4200, currency: 'USD', pricePeriod: PricePeriod.MONTHLY,
      purpose: PropertyPurpose.RENT, propertyType: PropertyType.SHOP,
      status: PropertyStatus.APPROVED,
      bathrooms: 2, area: 168, yearBuilt: 2012, floor: 1, totalFloors: 9,
      parkingSpaces: 4, address: 'Mirzo Ulugbek Avenue 14',
      locationSlug: 'uzbekistan-tashkent-mirzo-ulugbek', categoryName: 'Commercial',
      agentIndex: 0, isFeatured: false,
      features: [
        { name: 'Frontage', value: '14 m' },
        { name: 'Current fit-out', value: 'Cafe' },
        { name: 'Extraction', value: 'Installed' },
      ],
    },
    {
      title: 'Logistics Warehouse with Yard',
      description:
        'A clear-span warehouse with 9-metre eaves, four dock levellers and a secure hardstanding yard. Suitable for last-mile distribution.',
      price: 620000, currency: 'USD', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.WAREHOUSE,
      status: PropertyStatus.APPROVED,
      area: 2400, yearBuilt: 2014, totalFloors: 1,
      parkingSpaces: 20, address: 'Sergeli Industrial Park, Unit 7',
      locationSlug: 'uzbekistan-tashkent-mirzo-ulugbek', categoryName: 'Commercial',
      agentIndex: 0, isFeatured: false,
      features: [
        { name: 'Eaves height', value: '9 m' },
        { name: 'Dock levellers', value: '4' },
        { name: 'Yard', value: 'Secure hardstanding' },
      ],
    },
    {
      title: 'Off-Plan Sea View Residences',
      description:
        'A launch-phase two-bedroom in a 2027 completion tower, with a staged payment plan and full sea outlook from every principal room.',
      price: 2100000, currency: 'AED', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.APARTMENT,
      status: PropertyStatus.PENDING,
      bedrooms: 2, bathrooms: 2, area: 121, yearBuilt: 2027, floor: 22, totalFloors: 48,
      parkingSpaces: 1, address: 'Marina Shores, Unit 2204',
      locationSlug: 'united-arab-emirates-dubai-marina', categoryName: 'New Development',
      agentIndex: 1, isFeatured: false,
      features: [
        { name: 'Handover', value: 'Q4 2027' },
        { name: 'Payment plan', value: '60/40' },
      ],
    },
    {
      title: 'Draft: Hillside Plot with Permission',
      description:
        'A sloping plot of just over one hectare with outline planning permission for a single dwelling. Listing still being prepared.',
      price: 340000, currency: 'EUR', pricePeriod: PricePeriod.ONE_TIME,
      purpose: PropertyPurpose.SALE, propertyType: PropertyType.LAND,
      status: PropertyStatus.DRAFT,
      area: 10400,
      parkingSpaces: 0, address: 'Cami de Can Rabella, Parcel 12',
      locationSlug: 'spain-barcelona-eixample', categoryName: 'New Development',
      agentIndex: 2, isFeatured: false,
      features: [{ name: 'Planning', value: 'Outline permission granted' }],
    },
  ];

  const properties: Awaited<ReturnType<typeof prisma.property.create>>[] = [];

  for (const seed of propertySeeds) {
    const location = locationBySlug.get(seed.locationSlug)!;
    const category = categoryByName.get(seed.categoryName)!;
    const { agent } = agents[seed.agentIndex];

    const isApproved = seed.status === PropertyStatus.APPROVED;
    const slug = slugify(seed.title);

    const property = await prisma.property.create({
      data: {
        title: seed.title,
        slug,
        description: seed.description,
        price: new Prisma.Decimal(seed.price),
        currency: seed.currency,
        pricePeriod: seed.pricePeriod,
        purpose: seed.purpose,
        propertyType: seed.propertyType,
        status: seed.status,
        bedrooms: seed.bedrooms,
        bathrooms: seed.bathrooms,
        area: seed.area,
        yearBuilt: seed.yearBuilt,
        floor: seed.floor,
        totalFloors: seed.totalFloors,
        parkingSpaces: seed.parkingSpaces,
        address: seed.address,
        city: location.city,
        district: location.district,
        country: location.country,
        latitude: location.latitude,
        longitude: location.longitude,
        isFeatured: seed.isFeatured,
        isPublished: seed.status !== PropertyStatus.DRAFT,
        isApproved,
        viewCount: isApproved ? Math.floor(seed.area * 3) : 0,
        agentId: agent.id,
        categoryId: category.id,
        locationId: location.id,
        features: { create: seed.features },
        images: {
          create: Array.from({ length: 4 }, (_, index) => ({
            url: imageUrl(slug, index),
            publicId: `seed/${slug}-${index}`,
            isPrimary: index === 0,
            sortOrder: index,
          })),
        },
      },
    });

    properties.push(property);
  }

  console.log('Synchronising agent listing counts...');

  for (const { agent } of agents) {
    const propertyCount = await prisma.property.count({
      where: { agentId: agent.id, deletedAt: null, isPublished: true, isApproved: true },
    });

    await prisma.agent.update({ where: { id: agent.id }, data: { propertyCount } });
  }

  // -------------------------------------------------------------------------
  //  Favorites, appointments, reviews
  // -------------------------------------------------------------------------
  console.log('Creating favorites...');

  const favoritePairs = [
    [0, 0], [0, 3], [0, 4],
    [1, 1], [1, 7],
    [2, 4], [2, 5],
    [3, 0], [3, 9],
    [4, 9], [4, 10],
  ];

  await prisma.favorite.createMany({
    data: favoritePairs.map(([userIndex, propertyIndex]) => ({
      userId: users[userIndex].id,
      propertyId: properties[propertyIndex].id,
    })),
    skipDuplicates: true,
  });

  console.log('Creating appointments...');

  const dayFromNow = (days: number, hour: number): Date => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date;
  };

  await prisma.appointment.createMany({
    data: [
      {
        propertyId: properties[0].id, userId: users[0].id,
        scheduledAt: dayFromNow(3, 11), status: AppointmentStatus.CONFIRMED,
        note: 'Interested in the balcony orientation and morning light.',
      },
      {
        propertyId: properties[1].id, userId: users[1].id,
        scheduledAt: dayFromNow(5, 15), status: AppointmentStatus.PENDING,
        note: 'Would like to see the garden-level unit as well.',
      },
      {
        propertyId: properties[4].id, userId: users[2].id,
        scheduledAt: dayFromNow(2, 17), status: AppointmentStatus.PENDING,
      },
      {
        propertyId: properties[7].id, userId: users[3].id,
        scheduledAt: dayFromNow(-6, 12), status: AppointmentStatus.COMPLETED,
        note: 'Second viewing with a surveyor.',
      },
      {
        propertyId: properties[9].id, userId: users[4].id,
        scheduledAt: dayFromNow(-2, 10), status: AppointmentStatus.CANCELLED,
        cancelReason: 'Buyer proceeded with another property.',
      },
    ],
  });

  console.log('Creating reviews...');

  const reviewSeeds = [
    { agentIndex: 0, userIndex: 0, rating: 5, comment: 'Jordan knew every building on the block and never oversold a single one. Closed in six weeks.' },
    { agentIndex: 0, userIndex: 1, rating: 5, comment: 'Straightforward, responsive and genuinely knowledgeable about Brooklyn stock.' },
    { agentIndex: 0, userIndex: 2, rating: 4, comment: 'Very helpful throughout. Scheduling viewings took a little longer than expected.' },
    { agentIndex: 1, userIndex: 2, rating: 5, comment: 'Leila handled an off-plan purchase from overseas and made the paperwork painless.' },
    { agentIndex: 1, userIndex: 3, rating: 4, comment: 'Good market knowledge in the Marina. Would use again.' },
    { agentIndex: 2, userIndex: 4, rating: 4, comment: 'Patient with a difficult renovation search and honest about the costs involved.' },
    { agentIndex: 2, userIndex: 5, rating: 3, comment: 'Decent service, though communication slowed down near the end of the process.' },
  ];

  for (const review of reviewSeeds) {
    await prisma.review.create({
      data: {
        agentId: agents[review.agentIndex].agent.id,
        authorId: users[review.userIndex].id,
        rating: review.rating,
        comment: review.comment,
      },
    });
  }

  console.log('Synchronising agent ratings...');

  for (const { agent } of agents) {
    const aggregate = await prisma.review.aggregate({
      where: { agentId: agent.id, deletedAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    });

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        rating: Math.round((aggregate._avg.rating ?? 0) * 10) / 10,
        reviewCount: aggregate._count._all,
      },
    });
  }

  // -------------------------------------------------------------------------
  //  Conversations & notifications
  // -------------------------------------------------------------------------
  console.log('Creating conversations...');

  const conversation = await prisma.conversation.create({
    data: {
      propertyId: properties[0].id,
      title: 'Sunlit Two-Bedroom in Williamsburg',
      participants: {
        create: [{ userId: users[0].id }, { userId: agents[0].user.id }],
      },
    },
  });

  const messageSeeds = [
    { senderId: users[0].id, content: 'Hello, is the Berry Street apartment still available?' },
    { senderId: agents[0].user.id, content: 'It is. Would you like to view it this week?' },
    { senderId: users[0].id, content: 'Thursday morning would work well for me.' },
    { senderId: agents[0].user.id, content: 'Thursday at 11 is booked in. See you then.' },
  ];

  for (const [index, message] of messageSeeds.entries()) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: message.senderId,
        content: message.content,
        type: MessageType.TEXT,
        // Everything but the final message has been read.
        isRead: index < messageSeeds.length - 1,
        readAt: index < messageSeeds.length - 1 ? new Date() : null,
      },
    });
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  console.log('Creating notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: agents[0].user.id,
        type: NotificationType.NEW_APPOINTMENT,
        title: 'New viewing request',
        body: 'Sofia Almeida requested a viewing of Sunlit Two-Bedroom in Williamsburg.',
        data: { propertyId: properties[0].id },
      },
      {
        userId: agents[0].user.id,
        type: NotificationType.NEW_REVIEW,
        title: 'You received a new review',
        body: 'Sofia Almeida left you a 5-star review.',
        isRead: true,
        readAt: new Date(),
      },
      {
        userId: users[0].id,
        type: NotificationType.APPOINTMENT_CONFIRMED,
        title: 'Viewing confirmed',
        body: 'Jordan Rivera confirmed your viewing appointment.',
        data: { propertyId: properties[0].id },
      },
      {
        userId: agents[1].user.id,
        type: NotificationType.PROPERTY_FAVORITED,
        title: 'Your listing was saved',
        body: 'Downtown Dubai Apartment Facing the Fountain was added to a favourites list.',
        data: { propertyId: properties[4].id },
      },
    ],
  });

  // -------------------------------------------------------------------------
  //  Summary
  // -------------------------------------------------------------------------
  const counts = {
    users: await prisma.user.count(),
    agents: await prisma.agent.count(),
    categories: await prisma.category.count(),
    locations: await prisma.location.count(),
    properties: await prisma.property.count(),
    images: await prisma.propertyImage.count(),
    features: await prisma.propertyFeature.count(),
    favorites: await prisma.favorite.count(),
    appointments: await prisma.appointment.count(),
    reviews: await prisma.review.count(),
    conversations: await prisma.conversation.count(),
    messages: await prisma.message.count(),
    notifications: await prisma.notification.count(),
  };

  console.log('\nSeed complete:');
  for (const [entity, count] of Object.entries(counts)) {
    console.log(`  ${entity.padEnd(15)} ${count}`);
  }

  console.log('\nDemo accounts (passwords come from your .env):');
  console.log(`  ADMIN  ${adminEmail}`);
  for (const { user } of agents) {
    console.log(`  AGENT  ${user.email}`);
  }
  console.log(`  USER   ${users[0].email}  (and ${users.length - 1} more)`);
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
