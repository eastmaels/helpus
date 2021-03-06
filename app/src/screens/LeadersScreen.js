import React, { useEffect, useState, useContext } from 'react';
import { View, StyleSheet, Platform, FlatList, TouchableOpacity } from 'react-native';
import { NavigationEvents, SafeAreaView } from 'react-navigation';
import firebase from 'react-native-firebase'; 
import { Text, ButtonGroup, Card, Overlay, ListItem, Avatar, Icon } from 'react-native-elements';
import Flag from 'react-native-flags';
import FastImage from 'react-native-fast-image';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native-gesture-handler';
import Leaderboard from 'react-native-leaderboard';
import Geocoder from 'react-native-geocoding';
import { GEOCODING_API_KEY } from 'react-native-dotenv';
import { Context as ProfileContext } from '../context/ProfileContext';

const LeadersScreen = ({ navigation }) => {
  // setup language
  const { t } = useTranslation();
  const language = i18next.language;
  // get reference to the current user
  const { currentUser } = firebase.auth();
  const userId = currentUser.uid;
  const maxElem = 20;
  // use context
  const { state } = useContext(ProfileContext);
  // use state
  const [tab, setTab] = useState(0);
  const [rank, setRank] = useState(0);
  const [indicator, setIndicator] = useState(0);
  const [boardData, setBoardData] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [userIndex, setUserIndex] = useState(null);
  const [userItem, setUserItem] = useState(null);
  const [userRegion, setUserRegion] = useState(null);
  const [showRegionRanking, setShowRegionRanking] = useState(false);
  const [regionBoardData, setRegionBoardData] = useState([]);

  // componentDidMount
  useEffect(() => {
    console.log('LeadersScreen');
    // fetch initial board data
    updateBoard(tab);
  }, []);


  const ordinal_suffix_of = (i) => {
    var j = i % 10,
        k = i % 100;
    if (j == 1 && k != 11) {
        return i + "st";
    }
    if (j == 2 && k != 12) {
        return i + "nd";
    }
    if (j == 3 && k != 13) {
        return i + "rd";
    }
    return i + "th";
  }

  // update leaderboard
  const updateBoard = (select) => {
    // set a tab
    setTab(select);
    // set field
    let property = '';
    switch (select) {
      case 0: 
        property = "helpCount"; 
        break;
      case 1: 
        property = "askCount"; 
        break;
      case 2: 
        property = "votes"; 
        break;
      case 3:
        property = "count";
      default: 
        break;
    }
    // return if the region board is selected
    if (select === 3) {
      setShowRegionRanking(true);
      // fetch data
      fetchRegionData();
      // update user rank
      updateUserRegionRank(property);
      return;
    }
    // reset the region ranking board
    setShowRegionRanking(false);
    // fetch new data
    fetchData(property);
    // update user rank
    updateUserRank(property);
  };

  // calculate the average rating
  const calucateAverageRating = (ratings) => {
    // check sanity
    if (!ratings) return 0;
    let sumRatings = 0;
    let ratingCount = 0;
    for( let i=0; i<ratings.length; i++) {
      sumRatings += (i+1)*ratings[i];
      ratingCount += ratings[i];
    }
    // check sanity and compute average
    let avgRating = 0;
    if (ratingCount > 0) {
      // average
      avgRating = (sumRatings/ratingCount).toFixed(1);
    } 
    return avgRating;
  }

  // fetch data and build board data
  const fetchData = async (property) => {
    // users on firestore
    const usersRef = firebase.firestore().collection('users');

    // count number of test accounts
    let numTesters = 0;
    await usersRef.where("tester", "==", true).get()
    .then(snapshot => {
      numTesters = snapshot.size;
    })
    .catch(error => console.log(error));

    //// get data
    // ordering and showing only top users
    usersRef.orderBy(property, "desc").limit(maxElem+numTesters)
    .onSnapshot(snapshot => {
      let data = [];
      // build data array
      snapshot.docs.forEach(doc => {
        // check doc exists
        if (!doc.exists) {
          return;
        }
        // do not include test accounts
        if (doc.data().tester) {
          return;
        }
        // check if the data exceeds the max 
        if (data.length >= maxElem) {
          return;
        } 
        // get skills
        const userRef = firebase.firestore().doc(`users/${doc.id}`);
        let skills = [];
        userRef.collection('skills').get()
        .then(snapshot2 => {
          if (snapshot2.empty) {
            console.log('No matching docs');
            return;
          }
          snapshot2.forEach(doc => {
            skills.push(doc.data());
          });
        })
        .catch(error => {
          console.log('cannot get skill data', error);
        });  

        // calculate average rating
        const avgRating = calucateAverageRating(doc.data().ratings);
        let nameAndRegion = doc.data().name;
        if (typeof doc.data().regions[0] !== 'undefined')
          nameAndRegion +=  ` (${doc.data().regions[0]})`;
        data = [...data, ({
          name: nameAndRegion,
          iconUrl: doc.data().avatarUrl,
          score: doc.data()[property],
          username: doc.data().name,
          helpCount: doc.data().helpCount,
          askCount: doc.data().askCount,
          votes: doc.data().votes,
          rating: avgRating,
          skills: skills,
          languages: doc.data().languages
        })];
      });
      // set data
      setBoardData(data);
    });
  };

  // update user's rank
  const updateUserRank = async (property) => {
    // users on firestore
    const usersRef = firebase.firestore().collection('users');
    usersRef.orderBy(property, "desc")
    .onSnapshot(snapshot => {
      let order = 1;
      snapshot.docs.forEach(doc => {
        // do not include test accounts
        if (!doc.data().tester) {
          // match with the user id
          if (userId === doc.id) {
            // set user data
            setRank(order);
            // set indicator
            setIndicator(doc.data()[property]);
            // set user region
            setUserRegion(doc.data().regionsEN[0]);
            return;
          }
          order++;
        }
      });
    });
  };

  // fetch region data from regions collection
  const fetchRegionData = async () => {
    // get regions collection ref
    const regionsRef = firebase.firestore().collection('regions');
    // get ordered data
    regionsRef.orderBy('count', "desc").limit(maxElem)
    .onSnapshot(snapshot => {
      // region data
      let regionData = [];
      snapshot.docs.forEach(async doc => {
        // convert the region in local language
        const coordinate = doc.data().coordinate;
        const queryParams = `latlng=${coordinate[0]},${coordinate[1]}&language=${language}&key=${GEOCODING_API_KEY}`;
        const url = `https://maps.googleapis.com/maps/api/geocode/json?${queryParams}`;
        let response, data;
        try {
          response = await fetch(url);
        } catch(error) {
          throw {
            code: Geocoder.Errors.FETCHING,
            message: "Error while fetching. Check your network",
            origin: error
          };
        }
        // parse data
        try {
          data = await response.json();
        } catch(error) {
          throw {
            code: Geocoder.Errors.PARSING,
            message : "Error while parsing response's body into JSON. The response is in the error's 'origin' field. Try to parse it yourself.",
            origin : response,
          };
        }
        if (data.status === 'OK') {
          // update region state
          const district = data.results[0].address_components[2].short_name;
          regionData = [...regionData, ({
            name: district,
            score: doc.data().count
          })];
          // set region data
          setRegionBoardData(regionData);
        }
      });
    });
  };

  // update user's region rank
  const updateUserRegionRank = async (property) => {
    // regions on firestore
    const regionsRef = firebase.firestore().collection('regions');
    regionsRef.orderBy(property, "desc")
    .onSnapshot(snapshot => {
      let order = 1;
      snapshot.docs.forEach(doc => {
        // do not include test accounts
        if (!doc.data().tester) {
          // match with the user id
          if (userRegion === doc.id) {
            console.log('updateUserRegionRank match found');
            // set user data
            setRank(order);
            // set indicator
            setIndicator(doc.data()[property]);
            return;
          }
          order++;
        }
      });
    });
  };

  const renderHeader = () => {
    return (
      <View colors={[, '#1da2c6', '#1695b7']}
        style={{ backgroundColor: '#119abf', padding: 15, paddingTop: 35, alignItems: 'center' }}>
        <Text style={{ fontSize: 25, color: 'white', }}>{state.userInfo.name}</Text>
        <View style={{
          flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
          marginBottom: 15, marginTop: 20
        }}>
          <Text style={{ color: 'white', fontSize: 25, flex: 1, textAlign: 'right', marginRight: 40 }}>
            {ordinal_suffix_of(rank)}
          </Text>
          <FastImage style={{ flex: .66, height: 60, width: 60, borderRadius: 60 / 2 }}
            source={{ uri: state.userInfo.avatarUrl }} />
          <Text style={{ color: 'white', fontSize: 25, flex: 1, marginLeft: 40 }}>
            {indicator} {t('cases')}  
          </Text>
        </View>
        <Text style={{ fontSize: 20, color: 'white' }}>{state.locations[0].district}</Text>
        <ButtonGroup
            onPress={(select) => updateBoard(select)}
            selectedIndex={tab}
            buttons={
              [t('LeadersScreen.helped'), t('LeadersScreen.gotHelped'), 
              t('LeadersScreen.voted'), t('LeadersScreen.region')]
            }
            containerStyle={{ height: 30 }} />
      </View>
    );
  };

  const renderUserInfo = async (item, index) => {
    // set user index and item to show
    setUserIndex(index);
    setUserItem(item);
    // set show modal flag
    setShowUserModal(true);
  };

  const renderUserCard = () => {
    return (
      <Card
        containerStyle={{ margin: 0, padding: 0 }}
        title={t('LeadersScreen.userInfo')}
      >
        <ListItem
          leftAvatar={
            <View>
              <Avatar size="large" rounded
                source={{
                  uri: userItem.iconUrl,
                }} 
              />
              <Text style={{ textAlign: 'center' }}>{userItem.username}</Text>
            </View>
          }
          title={
            <View>
              <View style={{ flexDirection: 'row' }}>
                <Icon 
                  type='font-awesome' 
                  name='gift' 
                  size={20} 
                  color={'#353535'}
                />
                <View>
                  {
                    userItem.skills.map((skill, id) => {
                      if (skill.name !== '') {
                        return (
                          <Text key={id} style={{ marginLeft: 6 }}>{skill.name}</Text>
                        );
                      }
                    }) 
                  }
                </View>
              </View>
    
              <View style={{ flexDirection: 'row' }}>
                <Icon type='font-awesome' name='hand-o-left' size={20} color={'#353535'}/>
                <Text style={{ marginLeft: 6 }}>{userItem.askCount}</Text>
              </View>
    
              <View style={{ flexDirection: 'row' }}>
                <Icon type='font-awesome' name='hand-o-right' size={20} color={'#353535'}/>
                <Text style={{ marginLeft: 6 }}>{userItem.helpCount}</Text>
              </View>
    
              <View style={{ flexDirection: 'row' }}>
                <Icon type='font-awesome' name='thumbs-o-up' size={20} color={'#353535'}/>
                <Text style={{ marginLeft: 8 }}>{userItem.rating} ({userItem.votes})</Text>
              </View>

              <View style={{ flexDirection: 'row' }}>
                <Icon type='font-awesome' name='language' size={20} color={'#353535'}/>
                {
                  userItem.languages[0] == 'ko' ? 
                  <Flag
                    style={ Platform.OS == 'ios' ? { marginLeft: 8, marginTop: 0, paddingTop: 0 } 
                      : { marginLeft: 8 }
                    } 
                    code="KR" size={24}
                  />
                   : 
                  <Flag
                    style={ Platform.OS == 'ios' ? { marginLeft: 8, marginTop: 0, paddingTop: 0 } 
                      : { marginLeft: 8 } 
                    }
                    code="GB" size={24}
                  />
                }
                {
                  typeof userItem.languages[1] == 'undefined' ? null :
                  userItem.languages[1] == 'ko' ? <Flag code="KR" size={24}/>
                   : <Flag code="GB" size={24}/>
                }
              </View>

            </View>
          }      
        />
      </Card>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView>
        {renderHeader()}
        <Overlay
          isVisible={showUserModal}
          height={300}
          width='90%'
          overlayBackgroundColor="lightgrey"
          windowBackgroundColor="rgba(255, 255, 255, .5)"
          onBackdropPress={() => setShowUserModal(false)}
        >
          {userItem && renderUserCard()}
        </Overlay>
        <Leaderboard 
          data={ showRegionRanking ? regionBoardData: boardData } 
          sortBy='score' 
          labelBy='name'
          icon={ showRegionRanking ? null : "iconUrl" }
          onRowPress={ showRegionRanking ? null : renderUserInfo }
        />
      </ScrollView>
    </SafeAreaView>
  );
}

LeadersScreen.navigationOptions = ({ navigation }) => {
  return {
    title: i18next.t('LeadersScreen.header'),
    headerStyle: {
      backgroundColor: '#07a5f3',
    },
    headerTintColor: '#fff',
    headerTitleStyle: {
      fontWeight: 'bold',
    },
  }
};


const styles = StyleSheet.create({
  mapContainer: {
    height: 280,
    marginBottom: 0
  },
  buttonContainer: {
    position: 'absolute',
    top: '65%',
    right: '3%'
  }
});

export default LeadersScreen;