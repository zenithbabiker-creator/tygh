export interface SeedCategory {
  category: string;
  items: string[];
}

export const NEW_SEED_CATEGORIES: SeedCategory[] = [
  {
    category: 'سوق 21 أجهزة بركانية',
    items: [
      'شواية لحم',
      'ثلاجة حلويات',
      'ماكينة شاورما كهرباء',
      'مضارب',
      'آيس ميكر'
    ]
  },
  {
    category: 'عام',
    items: [
      'طاولة السندوتش',
      'صواني قرص',
      'ميزان ساعة',
      'شواية مشكل',
      'حوضات',
      'ديسبنسر',
      'صحن السندوتش',
      'كرتونة زجاج',
      'شيخ الشواية',
      'فرامة أكياس + أخشاب',
      'شاورما دجاج',
      'غلاية لتر',
      'مبرد عصير',
      'منشر لحوم',
      'غلاية لتر كهرباء',
      'شواية عرض السندوتش',
      'بسكيت سمك',
      'شواية فراخ',
      'كرتونة صواني',
      'غلاية غاز',
      'قاطع سيخ شتراك صغير',
      'عصارة برتقال'
    ]
  },
  {
    category: 'الأجهزة',
    items: [
      'طاولة السندوتش',
      'طباخة 2 شعلة فول',
      'م. السندوتش مرضى',
      'ماكينة بطاطس',
      'مبرد غاز',
      'فريزر هاير جديد',
      'ماكينة سمك',
      'شواية فراخ دوار',
      'غلاية لتر كهرباء',
      'ماكينة بروست ضغط',
      'صندل في مكان نائي يصعب الوصول إليه'
    ]
  },
  {
    category: 'المخزن الشروق',
    items: [
      'شوايه فحم',
      'شاورما دبل',
      'غلايه غاز',
      'سخانات بروست أحمر',
      'فرن طبقة غاز',
      'مضرب نابوليتان',
      'بوفيه',
      'قلاب لحوم',
      'مسخنات بروست',
      'توستر',
      'كرتونه تقطيع بطاطس',
      'كرتونه ثلج',
      'قلايه 2 عين غاز',
      'وافل مدور + مربع',
      'ايس ميكر كيلو',
      'منشار لحمه',
      'كسارة ثلج',
      'ماكينه كاشير',
      'بروست',
      'فرن طابق',
      'شوايه لحم',
      'غلايه كهرباء لتر'
    ]
  },
  {
    category: 'مخزن العمدة غرب',
    items: [
      'حوض عين',
      'راس شاورما',
      'ثلاجة حلويات',
      'شواية فحم',
      'ثلاجة عرض السندوتش',
      'مفرمة',
      'سخان بروست',
      'كابتشينو',
      'خلاط لتر',
      'سخانة منزلية',
      'مسن بروست',
      'مفرمة لحم',
      'خلاط لتر ك',
      'كسارة ثلج',
      'كبسة دبل مفرد',
      'قلاية مفرد غاز',
      'كبس سمك',
      'سخان ماء بويلر',
      'ماكينة تتبيل بروست',
      'كرتونة صحون',
      'وافل مربع',
      'فرن مدور'
    ]
  }
];

export interface InitialProductItem {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  unit: string;
  price: number;
  description: string;
  updatedAt: string;
}

/**
 * Builds the comprehensive list of 82 initial products
 */
export function generateInitialProducts(): InitialProductItem[] {
  const products: InitialProductItem[] = [];
  let seq = 1;
  const now = new Date().toISOString();

  for (const cat of NEW_SEED_CATEGORIES) {
    for (const itemName of cat.items) {
      const codeNum = 100 + seq;
      products.push({
        id: String(seq),
        code: `NASSER-${codeNum}`,
        name: itemName,
        category: cat.category,
        stock: 10,
        minStock: 5,
        unit: 'وحدة',
        price: 0,
        description: `صنف معتمد: ${itemName} - قسم ${cat.category}`,
        updatedAt: now,
      });
      seq++;
    }
  }

  return products;
}

export const INITIAL_PRODUCTS: InitialProductItem[] = generateInitialProducts();
