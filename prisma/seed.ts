import { BadRequestException, Logger } from '@nestjs/common';
import {
  Category,
  Company,
  CompanyAddress,
  FeeType,
  PrismaClient,
  Product,
  User,
} from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const companies = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'const/companies.json'), 'utf-8'),
) as Company[];

const companyAddresses = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'const/company-addresses.json'), 'utf-8'),
) as CompanyAddress[];

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

  // 0. 우편번호(Zipcode) 추가(데이터가 많아 별도 트랜잭션으로 처리함)
  await prisma.$transaction(
    async tx => {
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
          // Logger.log(
          //   `postalCode: ${postalCode}, feeType: ${feeType}, isActive: ${isActive}, juso: ${juso}`,
          // );
          if (!postalCode || !feeType || !isActive) {
            Logger.error(`❌ 잘못된 데이터 형식: ${line}`);
            throw new BadRequestException(`❌ 잘못된 데이터 형식: ${line}`);
          }

          return {
            postalCode: String(postalCode.trim()), // 숫자로 인식되지 않도록 문자열로 변환(0으로 시작하는 경우 앞글자가 없어지면 안되므로)
            feeType: feeType.trim() as FeeType, // 배송비 유형(제주, 도서산간, 이외), @prisma/client에 정의된 타입 사용
            isActive: isActive.trim().toLowerCase() === 'true', // 현재 활성화 여부
            juso: juso.trim(), // 주소 저장
          };
        })
        .filter((zipcode): zipcode is NonNullable<typeof zipcode> => zipcode !== null);

      Logger.log(`📄 TSV 데이터: ${zipcodes.length}개의 데이터 로드 완료`);

      let zipcodeResultMessage = '';
      const noExistsMessage = '🎉 우편번호 데이터가 없어 새로 생성했습니다.';
      const allExistsMessage =
        '🎉 우편번호 데이터가 모두 있어 테이블에 있는 데이터를 삭제하지 않았습니다.';
      const someExistsMessage =
        '🎉 우편번호 데이터가 일부분만 있어 테이블에 있는 데이터를 삭제한 뒤 다시 생성했습니다.';
      // 우편번호 데이터 추가(도서산간지역 배송비 추가 관련)
      const existingZipcode = await tx.zipcode.aggregate({
        _count: { id: true },
      });

      if (existingZipcode._count.id === 0) {
        // DB에 데이터가 없는 경우 새로운 데이터 추가
        await tx.zipcode.createMany({
          data: zipcodes,
          skipDuplicates: true,
        });
        zipcodeResultMessage = noExistsMessage;
      } else {
        // 만약 시딩할 데이터가 DB에 모두 있는 경우(11931개) deleteMany() 패스
        if (existingZipcode._count.id === 11931) {
          zipcodeResultMessage = allExistsMessage;
        } else {
          // DB에 데이터가 일부라도 있는 경우(11931개 미만) 기존 데이터 삭제 후 새로운 데이터 추가
          await tx.zipcode.deleteMany();
          await tx.zipcode.createMany({
            data: zipcodes,
            skipDuplicates: true,
          });
          zipcodeResultMessage = someExistsMessage;
        }
      }

      Logger.log(zipcodeResultMessage);

      Logger.log(`📄 우편번호 데이터 추가 완료`);
    },
    { timeout: 30000 }, // 트랜잭션 타임아웃 30초 설정
  );

  await prisma.$transaction(
    async tx => {
      // 1. 기업 데이터 및 기업 주소 데이터 추가
      // 아래 다른 테이블 입력을 위해 테스트 기업 선택
      const testCompany: Company = companies[0];

      // 1-1. 기업 생성
      await tx.company.createMany({
        data: companies,
        skipDuplicates: true,
      });

      // 1-2. 기업 주소 생성
      for (const address of companyAddresses) {
        // Logic: 도서산간 우편번호라면 CompanyAddress에 zipcodeId를 추가하고, 아니면 추가하지 않는다.
        // 아래 zipcode 변수가 address.postalCode와 같은 우편번호를 가진 데이터가 여러개인 경우 첫 번째 우편번호를 사용함
        // 주소가 일치하는 경우에만 추가

        // 우편번호 테이블에서 입력받은 우편번호와 일치하는 데이터 조회
        const zipcode = await tx.zipcode.findMany({
          where: { postalCode: address.postalCode },
        });

        // 기업 주소 테이블에서 입력받은 우편번호와 주소가 일치하는 데이터 조회
        const juso = zipcode.find(z => z.juso === address.address);
        // 주소가 일치하지 않으면 zipcodeId를 추가하지 않고, 주소가 일치하면 zipcodeId를 추가
        if (!juso) {
          const { companyId, zipcodeId: _zipcodeId, ...rest } = address;
          await tx.companyAddress.create({
            data: {
              ...rest,
              company: { connect: { id: companyId } },
            },
          });
        } else {
          const { companyId, zipcodeId: _zipcodeId, ...rest } = address;
          await tx.companyAddress.create({
            data: {
              ...rest,
              company: { connect: { id: companyId } },
              zipcode: { connect: { id: juso.id } },
            },
          });
        }
      }

      // 2. Category 데이터 추가
      const parentCategories: Category[] = categories.map(category => ({
        ...category,
        companyId: testCompany.id,
      }));
      if (categories.length === 0) {
        throw new BadRequestException('Categories not found');
      }
      await tx.category.createMany({
        data: parentCategories,
        skipDuplicates: true,
      });

      // 3. SubCategory 데이터 추가
      const subCategoriesWithCompany: Category[] = subCategories.map(category => ({
        ...category,
        companyId: testCompany.id,
      }));
      if (subCategories.length === 0) {
        throw new BadRequestException('SubCategories not found');
      }
      await tx.category.createMany({
        data: subCategoriesWithCompany,
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
          userId:
            users[4]?.id ??
            (() => {
              throw new BadRequestException('사용자 ID가 존재하지 않습니다.');
            })(),
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
            requesterId:
              users[0]?.id ??
              (() => {
                throw new BadRequestException('요청자 ID가 존재하지 않습니다.');
              })(),
            companyId:
              testCompany?.id ??
              (() => {
                throw new BadRequestException('회사 ID가 존재하지 않습니다.');
              })(),
            status: 'PENDING',
            totalAmount: 0, // 초기값은 0으로 설정, 나중에 계산하여 덮어씀
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: orderRequestIds[1],
            requesterId:
              users[6]?.id ??
              (() => {
                throw new BadRequestException('요청자 ID가 존재하지 않습니다.');
              })(),
            companyId:
              testCompany?.id ??
              (() => {
                throw new BadRequestException('회사 ID가 존재하지 않습니다.');
              })(),
            status: 'APPROVED',
            totalAmount: 0, // 초기값은 0으로 설정, 나중에 계산하여 덮어씀
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: orderRequestIds[2],
            requesterId:
              users[1]?.id ??
              (() => {
                throw new BadRequestException('요청자 ID가 존재하지 않습니다.');
              })(),
            companyId:
              testCompany?.id ??
              (() => {
                throw new BadRequestException('회사 ID가 존재하지 않습니다.');
              })(),
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

      for (const item of orderRequestItems) {
        const existingOrderRequestItem = await tx.orderRequestItem.findUnique({
          where: { id: item.id },
        });

        if (!existingOrderRequestItem) {
          await tx.orderRequestItem.create({
            data: item,
          });
        }
      }

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

      Logger.log('🎉 데이터베이스 시딩이 완료되었습니다!');
    },
    { timeout: 30000 }, // 트랜잭션 타임아웃 30초 설정
  );
};

main()
  .catch(e => {
    Logger.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
