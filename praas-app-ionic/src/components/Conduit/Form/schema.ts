import * as Yup from 'yup';
import { conduitTypes } from '../options';

const conduitSchema = Yup.object().shape({
  suriApiKey: Yup.string().required('Api key is required'),
  suriType: Yup.string()
    .oneOf(
      conduitTypes.map((conduitType) => conduitType.value),
      'Invalid service type'
    )
    .required('Service type required'),
  suri: Yup.string().required('Service Endpoint uri is required'),
  whitelist: Yup.array()
    .of(
      Yup.object().shape({
        address: Yup.string().required('IP Address Required'),
        comment: Yup.string().required('Comment required'),
        state: Yup.string().required('IP state required'),
      })
    )
    .required(),
  racm: Yup.array()
    .min(1, 'Select atleast on request method')
    .required('Request methods is required'),
  description: Yup.string().required('Description is required'),
});

export default conduitSchema;