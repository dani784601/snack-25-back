import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaService } from '@src/shared/prisma/prisma.service';
import { PrismaModule } from '@src/shared/prisma/prisma.module';
import { CartsModule } from '@src/carts/carts.module';
import { ProductsModule } from '@src/products/products.module';

@Module({
  imports: [PrismaModule, CartsModule, ProductsModule],
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService],
  exports: [OrdersService],
})
export class OrdersModule {}
