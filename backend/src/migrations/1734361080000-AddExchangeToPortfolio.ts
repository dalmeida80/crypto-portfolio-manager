import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddExchangeToPortfolio1734361080000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'portfolios',
      new TableColumn({
        name: 'exchange',
        type: 'varchar',
        length: '50',
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('portfolios', 'exchange');
  }
}
