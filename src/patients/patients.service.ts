import {
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { data_providers } from '../constants';
import { Repository } from 'typeorm';
import { Patient } from './entities/patient.entity';
import { Id } from '../entity-base/vo/id.vo';
import { SchoolService } from './school.service';
import { UpdateSchoolDto } from './dto/school/update-school.dto';
import { ComorbiditiesService } from './comorbidities.service';
import { Comorbidity } from './entities/comorbidity.entity';
import { MedicamentInfo } from './entities/medicament-info.entity';
import { MedicamentInfoService } from './medicament-info.service';
import { CreateMedicamentInfoDto } from './dto/medicine/create-medicament-info.dto';
import { CreateComorbidityDto } from './dto/comorbities/create-comorbidity.dto';
import { CreatePersonDto } from '../persons/dto/createPerson.dto';
import { PersonsService } from '../persons/persons.service';
import { CreateSchoolDto } from './dto/school/create-school.dto';
import { DocumentsService } from '../documents/documents.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { School } from './entities/school.entity';
import { Person } from 'src/persons/entities/person.enitiy';

@Injectable()
export class PatientsService {
  constructor(
    @Inject(data_providers.PATIENT_REPOSITORY)
    private patientRepository: Repository<Patient>,
    private readonly schoolService: SchoolService,
    private readonly comorbiditiesService: ComorbiditiesService,
    private readonly medicamentInfoService: MedicamentInfoService,
    private readonly personsService: PersonsService,
    @Inject(forwardRef(() => DocumentsService))
    private documentService: DocumentsService,
    @Inject()
    private cloudinaryService: CloudinaryService
  ) {}

  async create(createPatientDto: CreatePatientDto) {
    const patient = this.patientRepository.create(
      new Patient({ ...createPatientDto, medicines: [], parents: [] })
    );
    const queryRunner =
      this.patientRepository.manager.connection.createQueryRunner();
    await queryRunner.startTransaction();

    try {
      let person = await this.setPerson(createPatientDto.person);
      let school = await this.setSchool(createPatientDto.school);
      let comorbidities: Comorbidity[] = await this.setComorbities(
        createPatientDto.comorbidities
      );
      let parents = await this.setParents(createPatientDto.parents);

      patient.person = person;
      patient.school = school;
      patient.comorbidities = comorbidities;
      patient.parents = parents;

      let savedPatient = await this.patientRepository.save(patient);

      let medicines = await this.setMedicines(
        createPatientDto.medicines,
        savedPatient
      );
      savedPatient.medicines = medicines;
      await queryRunner.commitTransaction();
      return savedPatient;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(err);
    }
  }

  private async setPerson(createPersondto: CreatePersonDto) {
    let person = await this.personsService.create(createPersondto);
    return person;
  }

  private async setParents(parents: CreatePersonDto[]) {
    let setParents = [];
    for (let personDto of parents) {
      let parent: Person;
      try{
        console.log('tentando achar por cpf')
        parent = await this.personsService.findOneByCPF(personDto.cpf);
      }
      catch {
        console.log('criando pai')
        parent = await this.personsService.create(personDto);
      }
      setParents.push(parent);
    }
    return setParents;
  }

  private async setSchool(schoolDto: CreateSchoolDto) {
    let school: School;
    try {
      school = await this.schoolService.findOneBy(schoolDto);
    } catch {
      school = await this.schoolService.create(schoolDto);
    }
    return school;
  }

  private async setMedicines(
    medicinesDto: CreateMedicamentInfoDto[],
    patient: Patient
  ) {
    let medicines: MedicamentInfo[] = [];
    for (let medicamentDto of medicinesDto) {
      let medicament = await this.medicamentInfoService.create(
        medicamentDto,
        patient
      );
      medicament.patient = undefined;
      medicines.push(medicament);
    }
    return medicines;
  }

  private async setComorbities(comorbidities: CreateComorbidityDto[]) {
    let setComorbidities: Comorbidity[] = [];
    for (let comorbidityDto of comorbidities) {
      let comorbidity = (
        await this.comorbiditiesService.findByName(comorbidityDto.name)
      ).at(0);
      if (!comorbidity)
        comorbidity = await this.comorbiditiesService.create(comorbidityDto);
      setComorbidities.push(comorbidity);
    }
    return setComorbidities;
  }

  async findAll() {
    return await this.patientRepository.find({
      relations: ['_school', '_comorbidities', '_person', '_parents'],
    });
  }

  async findOne(id: string) {
    try {
      let patient = await this.patientRepository
        .createQueryBuilder('patient')
        .leftJoinAndSelect('patient._school', '_school')
        .leftJoinAndSelect('patient._comorbidities', '_comorbidities')
        .leftJoinAndSelect('patient._person', '_person')
        .where('patient.id = :id', { id })
        .getOneOrFail();

      patient.medicines = await this.medicamentInfoService.findAllToPatient(
        patient.id.id
      );
      return patient;
    } catch (err) {
      throw new NotFoundException(err?.message);
    }
  }

  async addComorbities(id: string, comorbities: CreateComorbidityDto[]) {
    let updatingPatient = new Patient({});
    updatingPatient.id = new Id(id);
    updatingPatient.comorbidities = await this.setComorbities(comorbities);

    try {
      await this.patientRepository.save(updatingPatient);
      let patient = await this.findOne(id);
      return patient;
    } catch (err) {
      throw new InternalServerErrorException(err?.message);
    }
  }

  async addMedicaments(id: string, medicaments: CreateMedicamentInfoDto[]) {
    let updatingPatient = new Patient({});
    updatingPatient.id = new Id(id);

    try {
      updatingPatient.medicines = await this.setMedicines(
        medicaments,
        updatingPatient
      );
      let patient = await this.findOne(id);
      return patient;
    } catch (err) {
      throw new InternalServerErrorException(err?.message);
    }
  }

  async update(id: string, updatePatientDto: UpdatePatientDto) {
    let updatingPatient = new Patient(updatePatientDto);
    updatingPatient.person = undefined;
    try {
      await this.patientRepository.update(id, updatingPatient);
      let patient = await this.findOne(id);
      if (updatePatientDto.person) {
        patient.person = await this.personsService.update(
          id,
          updatePatientDto.person
        );
      }
      return patient;
    } catch (err) {
      throw new InternalServerErrorException(err?.message);
    }
  }

  async updateSchool(id: string, school: UpdateSchoolDto) {
    const newSchool = await this.schoolService.findOneBy(school);
    let updatingPatient = new Patient({});
    updatingPatient.school = newSchool;

    try {
      await this.patientRepository.update(id, updatingPatient);
      let patient = await this.findOne(id);
      return patient;
    } catch (err) {
      throw new InternalServerErrorException(err?.message);
    }
  }

  async remove(id: string) {
    let patient = await this.findOne(id);
    const documents = await this.documentService.findAllByPatient(
      patient.id.id
    );

    await this.personsService.delete(patient.person.id.id);
    await this.patientRepository.delete(patient.id.id);
    if (documents) {
      documents.forEach(async (document) => {
        const publicID = document.docLink.split('/').slice(-1)[0];

        await this.cloudinaryService.deleteFileOtherThanImage(publicID);
      });
    }
  }

  async removeMedicament(patientId: string, medicamentId: string) {
    return await this.medicamentInfoService.remove(patientId, medicamentId);
  }
}
