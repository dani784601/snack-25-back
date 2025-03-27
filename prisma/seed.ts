import { Logger, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { Company, Category, Product, User } from '@prisma/client';

const prisma = new PrismaClient();

const companies = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'const/companies.json'), 'utf-8'),
) as Company[];

const categories = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'const/categories.json'), 'utf-8'),
) as Category[];

const subCategories: Category[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'const/sub-categories.json'), 'utf-8'),
) as Category[];

const users = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'const/users.json'), 'utf-8'),
) as User[];

const products = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'const/products.json'), 'utf-8'),
) as Product[];

const main = async (): Promise<void> => {
  Logger.log('🚀 데이터베이스를 시딩중입니다...');

  await prisma.$transaction(async tx => {
    /**
     * 변경된 데이터
     */
    // 1. Company 데이터 추가
    const testCompany: Company = companies[0];
    if (!testCompany) {
      throw new BadRequestException('Test company not found');
    } else {
      await tx.company.upsert({
        where: { id: testCompany.id },
        update: {},
        create: testCompany,
      });
    }

    // 2. Category 데이터 추가
    const parentCategories: Category[] = categories;
    if (categories.length === 0) {
      throw new BadRequestException('Categories not found');
    }
    await tx.category.createMany({
      data: parentCategories,
      skipDuplicates: true,
    });

    // 3. SubCategory 데이터 추가
    if (subCategories.length === 0) {
      throw new BadRequestException('SubCategories not found');
    }
    await tx.category.createMany({
      data: subCategories,
      skipDuplicates: true,
    });

    // 4. User 데이터 추가
    await tx.user.createMany({
      data: users,
      skipDuplicates: true,
    });

    // 5. Product 데이터 추가
    await tx.product.createMany({
      data: products,
      skipDuplicates: true,
    });

    /**
     * 기존 데이터
     */

    // 6. 장바구니 추가
    await tx.cart.upsert({
      where: { id: 'bhcxqfshp43wkskocodegc7x' },
      update: {},
      create: {
        id: 'bhcxqfshp43wkskocodegc7x',
        userId: users[4]?.id || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    // 7. 주문 요청 추가
    const orderRequestIds = [
      'nz2p1larko8dcbyr7ej08v98',
      'xp569x8t45rbax2m2pqhqsnl',
      'uc4os87dbme8k5gom16lqb6u',
    ];
    await tx.orderRequest.createMany({
      data: [
        {
          id: orderRequestIds[0],
          requesterId: users[0]?.id || '',
          companyId: testCompany?.id || '',
          status: 'PENDING',
          totalAmount: 0, // 초기값은 0으로 설정, 나중에 계산하여 덮어씀
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: orderRequestIds[1],
          requesterId: users[6]?.id || '',
          companyId: testCompany?.id || '',
          status: 'APPROVED',
          totalAmount: 0, // 초기값은 0으로 설정, 나중에 계산하여 덮어씀
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: orderRequestIds[2],
          requesterId: users[1]?.id || '',
          companyId: testCompany?.id || '',
          status: 'REJECTED',
          totalAmount: 0, // 초기값은 0으로 설정, 나중에 계산하여 덮어씀
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      skipDuplicates: true,
    });

    // 8. 주문 요청 아이템 추가
    // createId() 대신 직접 값 할당
    const orderRequestItemsIds = [
      'ux1idk821b5j1qmv6b30ncko',
      'fugejwfmuo43d7po46psreto',
      'vsqr28wsy0oxz1fzstc9s8l1',
      'iurp3qr1rffhzj9lan7sbu6c',
      'dirjv4wqu8fhb6up8n0frnzl',
      'hfe0sszybej58jdqfmqtnpgi',
    ];
    const orderRequestItems = [
      {
        id: orderRequestItemsIds[0],
        orderRequestId: orderRequestIds[0],
        productId: products[0].id,
        quantity: 2,
        price: products[0].price,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: orderRequestItemsIds[1],
        orderRequestId: orderRequestIds[0],
        productId: products[1].id,
        quantity: 3,
        price: products[1].price,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: orderRequestItemsIds[2],
        orderRequestId: orderRequestIds[1],
        productId: products[1].id,
        quantity: 1,
        price: products[1].price,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: orderRequestItemsIds[3],
        orderRequestId: orderRequestIds[1],
        productId: products[2].id,
        quantity: 3,
        price: products[2].price,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: orderRequestItemsIds[4],
        orderRequestId: orderRequestIds[1],
        productId: products[3].id,
        quantity: 4,
        price: products[3].price,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: orderRequestItemsIds[5],
        orderRequestId: orderRequestIds[2],
        productId: products[1].id,
        quantity: 2,
        price: products[1].price,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ].map((item, index) => ({
      ...item,
      id: orderRequestItemsIds[index],
    }));

    await tx.orderRequestItem.createMany({
      data: orderRequestItems,
      skipDuplicates: true,
    });

    // 9. 각 주문 요청에 대해 totalAmount 계산 후 업데이트
    for (const orderRequestId of orderRequestIds) {
      // 해당 주문 요청의 아이템 조회
      const items = await tx.orderRequestItem.findMany({
        where: { orderRequestId },
      });

      // totalAmount 계산 (각 아이템의 price * quantity 합산)
      const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

      // 주문 요청의 totalAmount 업데이트
      await tx.orderRequest.update({
        where: { id: orderRequestId },
        data: { totalAmount },
      });
    }

    // 10. 우편번호(Zipcode) 추가(tsv로 불러오기)
    // FeeType은 추후 적절한 위치로 옮겨서 단일 진실 공급원(Single Source of Truth) 준수
    type FeeType = 'NOT_APPLICABLE' | 'JEJU' | 'ISOLATED';
    // 우편번호 데이터 파일 경로(seed.ts와 같은 경로)
    const filePath = path.join(__dirname, 'zipcodes.tsv');

    // 파일 존재 여부 확인
    if (!fs.existsSync(filePath)) {
      console.error(`❌ zipcodes.tsv 파일을 찾을 수 없습니다: ${filePath}`);
      return;
    }
    const zipCodesFile = fs.readFileSync(filePath, 'utf-8');

    const lines = zipCodesFile.split('\n').slice(1).filter(Boolean); // 첫 줄(헤더) 제거하고 빈 줄 필터링
    const zipcodes = lines
      .map(line => {
        const [postalCode, feeType, isActive, juso] = line.split('\t');

        // 한 줄 테스트
        Logger.log(
          `postalCode: ${postalCode}, feeType: ${feeType}, isActive: ${isActive}, juso: ${juso}`,
        );
        if (!postalCode || !feeType || !isActive) {
          Logger.error(`❌ 잘못된 데이터 형식: ${line}`);
          throw new BadRequestException(`❌ 잘못된 데이터 형식: ${line}`);
        }

        return {
          postalCode: String(postalCode.trim()), // 숫자로 인식되지 않도록 문자열로 변환(0으로 시작하는 경우 앞글자가 없어지면 안되므로)
          feeType: feeType.trim() as FeeType, // ENUM 변환(제주, 도서산간, 이외)
          isActive: isActive.trim().toLowerCase() === 'true', // 현재 활성화 여부
          juso: juso.trim(), // 주소 저장
        };
      })
      .filter((zipcode): zipcode is NonNullable<typeof zipcode> => zipcode !== null);

    Logger.log(`📄 TSV 데이터: ${zipcodes.length}개의 데이터 로드 완료`);

    // 우편번호 데이터 추가(도서산간지역 배송비 추가 관련)
    await tx.zipcode.createMany({
      data: zipcodes,
      skipDuplicates: true,
    });

    Logger.log(`📄 우편번호 데이터 추가 완료`);

    Logger.log('🎉 데이터베이스 시딩이 완료되었습니다!');
  });
};

main()
  .catch(e => {
    Logger.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
